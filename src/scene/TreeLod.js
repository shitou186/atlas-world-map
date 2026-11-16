// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { ModelAssets } from '../models/ModelAssets.js';
import {
  WebGLRenderTarget,
  SRGBColorSpace,
  LinearMipmapLinearFilter,
  Scene,
  Group,
  MeshLambertMaterial,
  DoubleSide,
  Mesh,
  HemisphereLight,
  DirectionalLight,
  OrthographicCamera,
  Color,
  BufferGeometry,
  Float32BufferAttribute,
} from 'three';
class TreeLod {
  constructor() {
    this.templates = new Map();
  }
  static level(distance, pixels, previousLevel = -1) {
    // 使用上一层级调整切换阈值，减少临界距离附近的细节层级抖动。
    const nearDistance = previousLevel === 0 ? 180 : 150;
    const farDistance = previousLevel === 2 ? 450 : 500;
    return distance < nearDistance && pixels > (previousLevel === 0 ? 70 : 90)
      ? 0
      : distance < farDistance && pixels > (previousLevel === 2 ? 28 : 22)
        ? 1
        : 2;
  }
  create(species, renderer, gl) {
    if (this.templates.has(species)) {
      return this.templates.get(species);
    }
    const detailedGeometry = {
      wood: ModelAssets.geometry(`tree/${species}/0/wood`),
      leaves: ModelAssets.geometry(`tree/${species}/0/leaves`),
    };
    const simplifiedGeometry = {
      wood: ModelAssets.geometry(`tree/${species}/1/wood`),
      leaves: ModelAssets.geometry(`tree/${species}/1/leaves`),
    };
    const atlas = new WebGLRenderTarget(2048, 512, {
      depthBuffer: true,
    });
    atlas.texture.colorSpace = SRGBColorSpace;
    atlas.texture.generateMipmaps = true;
    atlas.texture.minFilter = LinearMipmapLinearFilter;
    const scene = new Scene();
    const treeGroup = new Group();
    const material = new MeshLambertMaterial({
      vertexColors: true,
      side: DoubleSide,
    });
    treeGroup.add(
      new Mesh(detailedGeometry.wood, material),
      new Mesh(detailedGeometry.leaves, material),
    );
    scene.add(treeGroup, new HemisphereLight(16777215, 8753519, 2));
    const sun = new DirectionalLight(16774877, 1.4);
    sun.position.set(-4, -8, 14);
    scene.add(sun);
    const camera = new OrthographicCamera(-4, 4, 6, -6, 0.1, 50);
    camera.up.set(0, 0, 1);
    camera.position.set(0, -20, 6);
    camera.lookAt(0, 0, 6);
    // 与地图共享 WebGL 上下文，烘焙图集前保存清屏颜色和深度范围，结束后恢复。
    const previousClearColor = renderer.getClearColor(new Color());
    const previousClearAlpha = renderer.getClearAlpha();
    const previousDepthRange = gl.getParameter(gl.DEPTH_RANGE);
    renderer.resetState();
    gl.depthRange(0, 1);
    renderer.setRenderTarget(atlas);
    renderer.setClearColor(0, 0);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);
    // 四个侧视图加一个俯视图写入图集，对应远处树木的交叉面片。
    for (let viewIndex = 0; viewIndex < 5; viewIndex++) {
      treeGroup.rotation.z = (viewIndex * Math.PI) / 2;
      if (viewIndex === 4) {
        treeGroup.rotation.z = 0;
        camera.left = -4;
        camera.right = 4;
        camera.top = 4;
        camera.bottom = -4;
        camera.up.set(0, 1, 0);
        camera.position.set(0, 0, 25);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
      }
      renderer.setViewport(viewIndex * 256, 0, 256, 512);
      renderer.setScissor(viewIndex * 256, 0, 256, 512);
      renderer.render(scene, camera);
    }
    renderer.setScissorTest(false);
    renderer.setRenderTarget(null);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    renderer.resetState();
    gl.depthRange(previousDepthRange[0], previousDepthRange[1]);
    material.dispose();
    const positions = [];
    const uvs = [];
    for (let viewIndex = 0; viewIndex < 5; viewIndex++) {
      const angle = (viewIndex * Math.PI) / 2;
      const halfWidthX = Math.cos(angle) * 4;
      const halfWidthY = Math.sin(angle) * 4;
      const corners =
        viewIndex === 4
          ? [
              [-4, -4, 6.5],
              [4, -4, 6.5],
              [4, 4, 6.5],
              [-4, 4, 6.5],
            ]
          : [
              [-halfWidthX, -halfWidthY, 0],
              [halfWidthX, halfWidthY, 0],
              [halfWidthX, halfWidthY, 12],
              [-halfWidthX, -halfWidthY, 12],
            ];
      const cornerUvs = [
        [viewIndex / 8, 0],
        [(viewIndex + 1) / 8, 0],
        [(viewIndex + 1) / 8, 1],
        [viewIndex / 8, 1],
      ];
      for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
        positions.push(...corners[cornerIndex]);
        uvs.push(...cornerUvs[cornerIndex]);
      }
    }
    const billboardGeometry = new BufferGeometry();
    billboardGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    billboardGeometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    billboardGeometry.computeVertexNormals();
    billboardGeometry.computeBoundingSphere();
    const template = {
      levels: [
        detailedGeometry,
        simplifiedGeometry,
        {
          foliage: billboardGeometry,
        },
      ],
      atlas: atlas,
    };
    this.templates.set(species, template);
    return template;
  }
  dispose() {
    for (const template of this.templates.values()) {
      for (const level of template.levels) {
        for (const geometry of Object.values(level)) {
          geometry.dispose();
        }
      }
      template.atlas.dispose();
    }
    this.templates.clear();
  }
}
export { TreeLod };

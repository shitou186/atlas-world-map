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
    const x = previousLevel === 0 ? 180 : 150;
    const T = previousLevel === 2 ? 450 : 500;
    return distance < x && pixels > (previousLevel === 0 ? 70 : 90)
      ? 0
      : distance < T && pixels > (previousLevel === 2 ? 28 : 22)
        ? 1
        : 2;
  }
  create(species, renderer, gl) {
    if (this.templates.has(species)) {
      return this.templates.get(species);
    }
    const x = {
      wood: ModelAssets.geometry(`tree/${species}/0/wood`),
      leaves: ModelAssets.geometry(`tree/${species}/0/leaves`),
    };
    const T = {
      wood: ModelAssets.geometry(`tree/${species}/1/wood`),
      leaves: ModelAssets.geometry(`tree/${species}/1/leaves`),
    };
    const w = new WebGLRenderTarget(2048, 512, {
      depthBuffer: true,
    });
    w.texture.colorSpace = SRGBColorSpace;
    w.texture.generateMipmaps = true;
    w.texture.minFilter = LinearMipmapLinearFilter;
    const l = new Scene();
    const D = new Group();
    const F = new MeshLambertMaterial({
      vertexColors: true,
      side: DoubleSide,
    });
    D.add(new Mesh(x.wood, F), new Mesh(x.leaves, F));
    l.add(D, new HemisphereLight(16777215, 8753519, 2));
    const U = new DirectionalLight(16774877, 1.4);
    U.position.set(-4, -8, 14);
    l.add(U);
    const j = new OrthographicCamera(-4, 4, 6, -6, 0.1, 50);
    j.up.set(0, 0, 1);
    j.position.set(0, -20, 6);
    j.lookAt(0, 0, 6);
    const q = renderer.getClearColor(new Color());
    const N = renderer.getClearAlpha();
    const J = gl.getParameter(gl.DEPTH_RANGE);
    renderer.resetState();
    gl.depthRange(0, 1);
    renderer.setRenderTarget(w);
    renderer.setClearColor(0, 0);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);
    for (let ue = 0; ue < 5; ue++) {
      D.rotation.z = (ue * Math.PI) / 2;
      if (ue === 4) {
        D.rotation.z = 0;
        j.left = -4;
        j.right = 4;
        j.top = 4;
        j.bottom = -4;
        j.up.set(0, 1, 0);
        j.position.set(0, 0, 25);
        j.lookAt(0, 0, 0);
        j.updateProjectionMatrix();
      }
      renderer.setViewport(ue * 256, 0, 256, 512);
      renderer.setScissor(ue * 256, 0, 256, 512);
      renderer.render(l, j);
    }
    renderer.setScissorTest(false);
    renderer.setRenderTarget(null);
    renderer.setClearColor(q, N);
    renderer.resetState();
    gl.depthRange(J[0], J[1]);
    F.dispose();
    const se = [];
    const Z = [];
    for (let ue = 0; ue < 5; ue++) {
      const ce = (ue * Math.PI) / 2;
      const pe = Math.cos(ce) * 4;
      const de = Math.sin(ce) * 4;
      const B =
        ue === 4
          ? [
              [-4, -4, 6.5],
              [4, -4, 6.5],
              [4, 4, 6.5],
              [-4, 4, 6.5],
            ]
          : [
              [-pe, -de, 0],
              [pe, de, 0],
              [pe, de, 12],
              [-pe, -de, 12],
            ];
      const ie = [
        [ue / 8, 0],
        [(ue + 1) / 8, 0],
        [(ue + 1) / 8, 1],
        [ue / 8, 1],
      ];
      for (const Y of [0, 1, 2, 0, 2, 3]) {
        se.push(...B[Y]);
        Z.push(...ie[Y]);
      }
    }
    const G = new BufferGeometry();
    G.setAttribute('position', new Float32BufferAttribute(se, 3));
    G.setAttribute('uv', new Float32BufferAttribute(Z, 2));
    G.computeVertexNormals();
    G.computeBoundingSphere();
    const re = {
      levels: [
        x,
        T,
        {
          foliage: G,
        },
      ],
      atlas: w,
    };
    this.templates.set(species, re);
    return re;
  }
  dispose() {
    for (const i of this.templates.values()) {
      for (const o of i.levels) {
        for (const p of Object.values(o)) {
          p.dispose();
        }
      }
      i.atlas.dispose();
    }
    this.templates.clear();
  }
}
export { TreeLod };

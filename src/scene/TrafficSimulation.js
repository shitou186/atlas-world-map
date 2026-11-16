// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import {
  Group,
  Matrix4,
  Sphere,
  Vector3,
  Color,
  MeshLambertMaterial,
  DoubleSide,
  ShaderChunk,
  InstancedBufferAttribute,
  DynamicDrawUsage,
  InstancedMesh,
  PlaneGeometry,
  ShaderMaterial,
  CanvasTexture,
  SRGBColorSpace,
} from 'three';
import { ModelAssets } from '../models/ModelAssets.js';
import { TrafficRoutes } from '../routes/TrafficRoutes.js';
class TrafficSimulation {
  constructor() {
    this.group = new Group();
    this.routes = [];
    this.enabled = true;
    this.moving = !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.clock = 0;
    this.lastTime = performance.now();
    this.capacity = 240;
    this.count = 0;
    this.matrix = new Matrix4();
    this.point = new Float64Array(4);
    this.before = new Float64Array(4);
    this.after = new Float64Array(4);
    this.sphere = new Sphere(new Vector3(), 3);
    this.palette = [
      '#e6e4db',
      '#aeb9c1',
      '#294250',
      '#ad4940',
      '#c3a25c',
      '#596e60',
      '#292e35',
      '#ece8df',
    ].map((color) => new Color(color));
    this.texture = TrafficSimulation.texture();
    this.material = new MeshLambertMaterial({
      map: this.texture,
      side: DoubleSide,
    });
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader =
        `attribute float paintMask; attribute float vehicleFade; varying float carFade;
` +
        shader.vertexShader
          .replace(
            '#include <color_vertex>',
            ShaderChunk.color_vertex.replace(
              'vColor.rgb *= instanceColor.rgb;',
              'vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, paintMask);',
            ),
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
carFade = vehicleFade;`,
          );
      shader.fragmentShader =
        `varying float carFade;
` +
        shader.fragmentShader.replace(
          '#include <alphatest_fragment>',
          `#include <alphatest_fragment>
if (carFade < fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453)) discard;`,
        );
    };
    this.material.customProgramCacheKey = () => 'car-paint-fade-v1';
    this.meshes = [];
    // 两种车身共用材质，通过实例颜色和渐隐属性减少绘制调用。
    for (let variantIndex = 0; variantIndex < 2; variantIndex++) {
      const geometry = ModelAssets.geometry(`car/${variantIndex}`);
      geometry.setAttribute(
        'vehicleFade',
        new InstancedBufferAttribute(new Float32Array(this.capacity), 1).setUsage(DynamicDrawUsage),
      );
      const mesh = new InstancedMesh(geometry, this.material, this.capacity);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.setColorAt(0, this.palette[0]);
      mesh.instanceColor.setUsage(DynamicDrawUsage);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    const shadowGeometry = new PlaneGeometry(5.1, 2.5);
    shadowGeometry.setAttribute(
      'vehicleFade',
      new InstancedBufferAttribute(new Float32Array(this.capacity), 1).setUsage(DynamicDrawUsage),
    );
    this.shadowMaterial = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      vertexShader:
        'attribute float vehicleFade; varying vec2 shadowUv; varying float shadowFade; void main() { shadowUv = uv * 2.0 - 1.0; shadowFade = vehicleFade; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'varying vec2 shadowUv; varying float shadowFade; void main() { float edge = max(abs(shadowUv.x), abs(shadowUv.y)); float alpha = (1.0 - smoothstep(0.45, 1.0, edge)) * 0.23 * shadowFade; gl_FragColor = vec4(0.04, 0.055, 0.065, alpha); }',
    });
    this.shadow = new InstancedMesh(shadowGeometry, this.shadowMaterial, this.capacity);
    this.shadow.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shadow.frustumCulled = false;
    this.shadow.count = 0;
    this.group.add(this.shadow);
  }
  setData(routes) {
    this.routes = routes;
    for (const route of routes) {
      const bounds = route.bounds;
      route.sphere = new Sphere(
        new Vector3((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2, route.points[2]),
        Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]) / 2 + 4,
      );
    }
    this.viewKey = '';
    this.candidates = [];
  }
  update(cameraPosition, frustum, pixelsPerUnit, visible, shadows, viewKey) {
    // 仅在可见且允许运动时推进模拟时钟，限制长时间停顿后的跳跃。
    const now = performance.now();
    if (
      (this.moving &&
        visible &&
        this.enabled &&
        !document.hidden &&
        (this.clock += Math.min(0.1, (now - this.lastTime) / 1000)),
      (this.lastTime = now),
      (this.group.visible = visible && this.enabled),
      !this.group.visible)
    ) {
      this.lastCpuMs = 0;
      return false;
    }
    // 视图变化时筛选并按距离排序路线，优先把有限实例分配给近处车辆。
    if (viewKey !== this.viewKey) {
      this.viewKey = viewKey;
      this.candidates = this.routes.filter(
        (route) =>
          frustum.intersectsSphere(route.sphere) &&
          cameraPosition.distanceTo(route.sphere.center) - route.sphere.radius < 1200,
      );
      this.candidates.sort(
        (firstRoute, secondRoute) =>
          cameraPosition.distanceToSquared(firstRoute.sphere.center) -
          cameraPosition.distanceToSquared(secondRoute.sphere.center),
      );
    }
    for (const mesh of this.meshes) {
      mesh.count = 0;
    }
    this.shadow.count = 0;
    let count = 0;
    for (const route of this.candidates) {
      for (
        let vehicleIndex = 0;
        vehicleIndex < route.count && count < this.capacity;
        vehicleIndex++
      ) {
        const distance =
          (((route.seed % 997) / 997) * route.length +
            (vehicleIndex * route.length) / route.count +
            this.clock * route.speed) %
          route.length;
        TrafficRoutes.sample(route, distance, this.point);
        this.sphere.center.set(this.point[0], this.point[1], this.point[2] + 0.8);
        const cameraDistance = cameraPosition.distanceTo(this.sphere.center);
        if (
          cameraDistance > 1200 ||
          (4.5 * pixelsPerUnit) / Math.max(1, cameraDistance) < 3 ||
          !frustum.intersectsSphere(this.sphere)
        ) {
          continue;
        }
        TrafficRoutes.sample(route, Math.max(0, distance - 1.3), this.before);
        TrafficRoutes.sample(route, Math.min(route.length, distance + 1.3), this.after);
        // 前后采样同时给出平面航向和坡度，车身与贴地阴影共享变换。
        const heading = Math.atan2(this.after[1] - this.before[1], this.after[0] - this.before[0]);
        const headingCos = Math.cos(heading);
        const headingSin = Math.sin(heading);
        const slope = Math.atan2(
          this.after[2] - this.before[2],
          Math.hypot(this.after[0] - this.before[0], this.after[1] - this.before[1]),
        );
        const slopeSin = Math.sin(slope);
        const slopeCos = Math.cos(slope);
        const fade = Math.min(
          1,
          distance / 5,
          (route.length - distance) / 5,
          Math.max(0, (1200 - cameraDistance) / 100),
        );
        const mesh = this.meshes[(route.seed + vehicleIndex) % 2];
        const instanceIndex = mesh.count++;
        this.matrix.set(
          headingCos * slopeCos,
          -headingSin,
          -headingCos * slopeSin,
          this.point[0],
          headingSin * slopeCos,
          headingCos,
          -headingSin * slopeSin,
          this.point[1],
          slopeSin,
          0,
          slopeCos,
          this.point[2],
          0,
          0,
          0,
          1,
        );
        mesh.setMatrixAt(instanceIndex, this.matrix);
        mesh.setColorAt(
          instanceIndex,
          this.palette[(route.seed + vehicleIndex * 3) % this.palette.length],
        );
        mesh.geometry.attributes.vehicleFade.setX(instanceIndex, fade);
        this.matrix.elements[14] += 0.014;
        this.shadow.setMatrixAt(count, this.matrix);
        this.shadow.geometry.attributes.vehicleFade.setX(count, fade);
        count++;
      }
      if (count === this.capacity) {
        break;
      }
    }
    this.shadow.count = count;
    this.shadow.visible = shadows;
    // 只上传有效实例对应的矩阵、颜色和渐隐区间。
    for (const mesh of [...this.meshes, this.shadow]) {
      for (const [attribute, itemSize] of [
        [mesh.instanceMatrix, 16],
        [mesh.instanceColor, 3],
        [mesh.geometry.attributes.vehicleFade, 1],
      ]) {
        if (!(!attribute || !mesh.count)) {
          attribute.clearUpdateRanges();
          attribute.addUpdateRange(0, mesh.count * itemSize);
          attribute.needsUpdate = true;
        }
      }
    }
    this.count = count;
    this.lastCpuMs = performance.now() - now;
    return this.moving && this.candidates.length > 0 && !document.hidden;
  }
  static texture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    const palette = [
      ['#e5e8eb', '#ffffff'],
      ['#182c39', '#90bac8'],
      ['#151a20', '#30363c'],
      ['#697983', '#e0e9ea'],
      ['#efdfaf', '#ffffe4'],
      ['#761c20', '#ef5a42'],
      ['#161e26', '#38434c'],
      ['#243a55', '#a4d0e3'],
    ];
    for (let paletteIndex = 0; paletteIndex < palette.length; paletteIndex++) {
      const offsetX = paletteIndex * 128;
      const gradient = context.createLinearGradient(offsetX, 128, offsetX + 80, 0);
      if (
        (gradient.addColorStop(0, palette[paletteIndex][0]),
        gradient.addColorStop(0.6, palette[paletteIndex][1]),
        gradient.addColorStop(1, palette[paletteIndex][0]),
        (context.fillStyle = gradient),
        context.fillRect(offsetX, 0, 128, 128),
        paletteIndex === 1 &&
          ((context.strokeStyle = '#cce5e8'),
          (context.lineWidth = 4),
          context.beginPath(),
          context.moveTo(offsetX + 14, 100),
          context.lineTo(offsetX + 84, 15),
          context.moveTo(offsetX + 26, 110),
          context.lineTo(offsetX + 96, 25),
          context.stroke(),
          (context.strokeStyle = '#101b24'),
          (context.lineWidth = 7),
          context.strokeRect(offsetX + 8, 8, 112, 112)),
        [2, 4, 5, 6].includes(paletteIndex))
      ) {
        context.fillStyle = paletteIndex === 6 ? '#91a1aa' : '#ffffff20';
        for (let stripeY = 12; stripeY < 120; stripeY += paletteIndex === 6 ? 12 : 7) {
          context.fillRect(offsetX + 10, stripeY, 108, 2);
        }
      }
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 2;
    return texture;
  }
  dispose() {
    for (const mesh of [...this.meshes, this.shadow]) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.material.dispose();
    this.shadowMaterial.dispose();
    this.texture.dispose();
    this.group.clear();
  }
}
export { TrafficSimulation };

// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import {
  Group,
  Matrix4,
  Sphere,
  Vector3,
  MeshLambertMaterial,
  InstancedMesh,
  DynamicDrawUsage,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { BoatAssets } from '../models/BoatAssets.js';
import { TrafficRoutes } from '../routes/TrafficRoutes.js';
class BoatSimulation {
  constructor() {
    this.group = new Group();
    this.enabled = true;
    this.moving = !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.clock = 0;
    this.lastTime = performance.now();
    this.capacity = 48;
    this.count = 0;
    this.routes = [];
    this.candidates = [];
    this.matrix = new Matrix4();
    this.point = new Float64Array(4);
    this.before = new Float64Array(4);
    this.after = new Float64Array(4);
    const geometry = BoatAssets.geometry.clone();
    this.sphere = new Sphere(
      new Vector3(),
      geometry.boundingSphere.radius + geometry.boundingSphere.center.length(),
    );
    const dimensions = geometry.boundingBox.getSize(new Vector3());
    const material = new MeshLambertMaterial({
      vertexColors: true,
    });
    // 船体与尾流分别使用实例化网格，每帧只更新实际可见的实例。
    this.mesh = new InstancedMesh(geometry, material, this.capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    const wakeLength = dimensions.x * 1.25;
    this.wakeOffset = geometry.boundingBox.min.x - wakeLength / 2;
    const wakeGeometry = new PlaneGeometry(wakeLength, dimensions.y * 2);
    const wakeMaterial = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 0,
      polygonOffsetUnits: -2,
      vertexShader:
        'varying vec2 waterUv; void main(){waterUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',
      fragmentShader:
        'varying vec2 waterUv;void main(){float x=waterUv.x;float edge=abs(waterUv.y-.5);float v=exp(-pow((edge-(1.0-x)*.42)*55.0,2.0));float fade=smoothstep(0.0,.18,x)*(1.0-smoothstep(.75,1.0,x));gl_FragColor=vec4(.82,.86,.85,v*fade*.22);}',
    });
    this.wake = new InstancedMesh(wakeGeometry, wakeMaterial, this.capacity);
    this.wake.instanceMatrix.setUsage(DynamicDrawUsage);
    this.wake.frustumCulled = false;
    this.wake.count = 0;
    this.group.add(this.mesh, this.wake);
  }
  setData(routes) {
    this.routes = routes;
    this.viewKey = '';
    for (const route of routes) {
      const bounds = route.bounds;
      route.sphere = new Sphere(
        new Vector3((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2, 0),
        Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]) / 2 + this.sphere.radius,
      );
    }
  }
  update(cameraPosition, frustum, visible, viewKey) {
    // 隐藏页面或暂停运动时不推进时钟，并限制恢复后的单帧时间增量。
    const now = performance.now();
    if (
      (this.enabled &&
        this.moving &&
        visible &&
        !document.hidden &&
        (this.clock += Math.min(0.1, (now - this.lastTime) / 1000)),
      (this.lastTime = now),
      (this.group.visible = visible && this.enabled),
      !this.group.visible)
    ) {
      return false;
    }
    // 视图变化时先裁剪整条路线，逐船采样后再做包围球和距离检查。
    if (this.viewKey !== viewKey) {
      this.viewKey = viewKey;
      this.candidates = this.routes.filter(
        (route) =>
          frustum.intersectsSphere(route.sphere) &&
          cameraPosition.distanceTo(route.sphere.center) - route.sphere.radius < 4000,
      );
    }
    this.count = 0;
    for (const route of this.candidates) {
      for (let boatIndex = 0; boatIndex < route.count && this.count < this.capacity; boatIndex++) {
        const distance =
          (((route.seed % 997) / 997) * route.length +
            (boatIndex * route.length) / route.count +
            this.clock * route.speed) %
          route.length;
        if (
          (TrafficRoutes.sample(route, distance, this.point),
          this.sphere.center.set(this.point[0], this.point[1], 2),
          !frustum.intersectsSphere(this.sphere) ||
            cameraPosition.distanceTo(this.sphere.center) > 4000)
        ) {
          continue;
        }
        TrafficRoutes.sample(route, Math.max(0, distance - 8), this.before);
        TrafficRoutes.sample(route, Math.min(route.length, distance + 8), this.after);
        // 前后采样点确定船头方向，尾流沿同一朝向偏移到船尾。
        const heading = Math.atan2(this.after[1] - this.before[1], this.after[0] - this.before[0]);
        const headingCos = Math.cos(heading);
        const headingSin = Math.sin(heading);
        this.matrix.set(
          headingCos,
          -headingSin,
          0,
          this.point[0],
          headingSin,
          headingCos,
          0,
          this.point[1],
          0,
          0,
          1,
          this.point[2],
          0,
          0,
          0,
          1,
        );
        this.mesh.setMatrixAt(this.count, this.matrix);
        this.matrix.elements[12] += headingCos * this.wakeOffset;
        this.matrix.elements[13] += headingSin * this.wakeOffset;
        this.matrix.elements[14] = 0.04;
        this.wake.setMatrixAt(this.count, this.matrix);
        this.count++;
      }
    }
    for (const mesh of [this.mesh, this.wake]) {
      mesh.count = this.count;
      if (this.count) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, this.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    return this.moving && this.candidates.length > 0 && !document.hidden;
  }
  dispose() {
    for (const mesh of [this.mesh, this.wake]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    }
    this.group.clear();
  }
}
export { BoatSimulation };

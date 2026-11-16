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
    const i = BoatAssets.geometry.clone();
    this.sphere = new Sphere(
      new Vector3(),
      i.boundingSphere.radius + i.boundingSphere.center.length(),
    );
    const o = i.boundingBox.getSize(new Vector3());
    const p = new MeshLambertMaterial({
      vertexColors: true,
    });
    this.mesh = new InstancedMesh(i, p, this.capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    const x = o.x * 1.25;
    this.wakeOffset = i.boundingBox.min.x - x / 2;
    const T = new PlaneGeometry(x, o.y * 2);
    const w = new ShaderMaterial({
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
    this.wake = new InstancedMesh(T, w, this.capacity);
    this.wake.instanceMatrix.setUsage(DynamicDrawUsage);
    this.wake.frustumCulled = false;
    this.wake.count = 0;
    this.group.add(this.mesh, this.wake);
  }
  setData(i) {
    this.routes = i;
    this.viewKey = '';
    for (const o of i) {
      const p = o.bounds;
      o.sphere = new Sphere(
        new Vector3((p[0] + p[2]) / 2, (p[1] + p[3]) / 2, 0),
        Math.hypot(p[2] - p[0], p[3] - p[1]) / 2 + this.sphere.radius,
      );
    }
  }
  update(i, o, p, x) {
    const T = performance.now();
    if (
      (this.enabled &&
        this.moving &&
        p &&
        !document.hidden &&
        (this.clock += Math.min(0.1, (T - this.lastTime) / 1000)),
      (this.lastTime = T),
      (this.group.visible = p && this.enabled),
      !this.group.visible)
    ) {
      return false;
    }
    if (this.viewKey !== x) {
      this.viewKey = x;
      this.candidates = this.routes.filter(
        (w) =>
          o.intersectsSphere(w.sphere) && i.distanceTo(w.sphere.center) - w.sphere.radius < 4000,
      );
    }
    this.count = 0;
    for (const w of this.candidates) {
      for (let l = 0; l < w.count && this.count < this.capacity; l++) {
        const D =
          (((w.seed % 997) / 997) * w.length + (l * w.length) / w.count + this.clock * w.speed) %
          w.length;
        if (
          (TrafficRoutes.sample(w, D, this.point),
          this.sphere.center.set(this.point[0], this.point[1], 2),
          !o.intersectsSphere(this.sphere) || i.distanceTo(this.sphere.center) > 4000)
        ) {
          continue;
        }
        TrafficRoutes.sample(w, Math.max(0, D - 8), this.before);
        TrafficRoutes.sample(w, Math.min(w.length, D + 8), this.after);
        const F = Math.atan2(this.after[1] - this.before[1], this.after[0] - this.before[0]);
        const U = Math.cos(F);
        const j = Math.sin(F);
        this.matrix.set(
          U,
          -j,
          0,
          this.point[0],
          j,
          U,
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
        this.matrix.elements[12] += U * this.wakeOffset;
        this.matrix.elements[13] += j * this.wakeOffset;
        this.matrix.elements[14] = 0.04;
        this.wake.setMatrixAt(this.count, this.matrix);
        this.count++;
      }
    }
    for (const w of [this.mesh, this.wake]) {
      w.count = this.count;
      if (this.count) {
        w.instanceMatrix.clearUpdateRanges();
        w.instanceMatrix.addUpdateRange(0, this.count * 16);
        w.instanceMatrix.needsUpdate = true;
      }
    }
    return this.moving && this.candidates.length > 0 && !document.hidden;
  }
  dispose() {
    for (const i of [this.mesh, this.wake]) {
      i.geometry.dispose();
      i.material.dispose();
      i.dispose();
    }
    this.group.clear();
  }
}
export { BoatSimulation };

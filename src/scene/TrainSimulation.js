// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import {
  Group,
  Matrix4,
  Sphere,
  Vector3,
  InstancedBufferAttribute,
  DynamicDrawUsage,
  MeshLambertMaterial,
  InstancedMesh,
} from 'three';
import { TrainAssets } from '../models/TrainAssets.js';
import { RailwayRoutes } from '../routes/RailwayRoutes.js';
import { TrafficRoutes } from '../routes/TrafficRoutes.js';
class TrainSimulation {
  constructor() {
    this.group = new Group();
    this.capacity = 12;
    this.count = 0;
    this.consists = 3;
    this.enabled = true;
    this.moving = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.clock = 0;
    this.lastTime = performance.now();
    this.routes = [];
    this.runs = [];
    this.candidates = [];
    this.selected = new Set();
    this.nextId = 0;
    this.matrix = new Matrix4();
    this.point = new Float64Array(4);
    this.front = new Float64Array(4);
    this.back = new Float64Array(4);
    this.sphere = new Sphere(new Vector3(), 8);
    this.meshes = [];
    for (const i of TrainAssets.models) {
      const o = i.geometry.clone();
      o.setAttribute(
        'trainFade',
        new InstancedBufferAttribute(new Float32Array(this.capacity), 1).setUsage(DynamicDrawUsage),
      );
      const p = new MeshLambertMaterial({
        map: i.texture,
      });
      p.onBeforeCompile = (T) => {
        T.vertexShader =
          `attribute float trainFade; varying float railFade;
` +
          T.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
railFade = trainFade;`,
          );
        T.fragmentShader =
          `varying float railFade;
` +
          T.fragmentShader.replace(
            '#include <alphatest_fragment>',
            `#include <alphatest_fragment>
if (railFade < fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453)) discard;`,
          );
      };
      p.customProgramCacheKey = () => 'train-fade';
      const x = new InstancedMesh(o, p, this.capacity);
      x.instanceMatrix.setUsage(DynamicDrawUsage);
      x.frustumCulled = false;
      x.receiveShadow = true;
      x.count = 0;
      this.meshes.push(x);
      this.group.add(x);
    }
  }
  setData(i) {
    const o = this.runs;
    this.routes = RailwayRoutes.build(i);
    this.runs = [];
    this.viewKey = '';
    for (const x of this.routes) {
      const T = x.bounds;
      x.sphere = new Sphere(
        new Vector3((T[0] + T[2]) / 2, (T[1] + T[3]) / 2, 2),
        Math.hypot(T[2] - T[0], T[3] - T[1]) / 2 + 10,
      );
    }
    const p = new Set();
    for (const x of o) {
      const T = this.progress(x);
      const w = x.route.loop ? T : Math.max(7, Math.min(x.route.length - 7, T));
      TrafficRoutes.sample(x.route, x.direction > 0 ? w : x.route.length - w, this.point);
      const l = this.point[3] + (x.direction < 0 ? Math.PI : 0);
      let D = null;
      for (const N of this.routes) {
        const J = N.bounds;
        if (
          N.type !== x.route.type ||
          N.gauge !== x.route.gauge ||
          this.point[0] < J[0] - 0.2 ||
          this.point[0] > J[2] + 0.2 ||
          this.point[1] < J[1] - 0.2 ||
          this.point[1] > J[3] + 0.2
        ) {
          continue;
        }
        const se = RailwayRoutes.project(N, this.point);
        if (!(!se || se.error > 0.04 || Math.abs(Math.cos(se.angle - l)) < 0.5)) {
          if (!D || se.error < D.error) {
            D = {
              ...se,
              route: N,
            };
          }
        }
      }
      if (!D) {
        continue;
      }
      const F = D.route;
      const U = Math.cos(D.angle - l) >= 0 ? 1 : -1;
      const j = U > 0 ? D.distance : F.length - D.distance;
      const q = F.loop ? F.length : F.length + x.cars * 14 + 25;
      this.runs.push({
        id: x.id,
        route: F,
        direction: U,
        cars: x.cars,
        span: q,
        phase: j + T - w - this.clock * F.speed,
      });
      p.add(F);
    }
    for (const x of this.routes) {
      if (!p.has(x)) {
        const T = x.loop ? x.length : x.length + x.cars * 14 + 25;
        this.runs.push({
          id: this.nextId++,
          route: x,
          direction: 1,
          cars: x.cars,
          span: T,
          phase: ((x.seed % 997) / 997) * T,
        });
      }
    }
    if (!this.runs.length) {
      this.selected.clear();
    }
  }
  progress(i) {
    return (((i.phase + this.clock * i.route.speed) % i.span) + i.span) % i.span;
  }
  update(i, o, p, x) {
    const T = performance.now();
    if (
      (p &&
        this.enabled &&
        this.moving &&
        !document.hidden &&
        (this.clock += Math.min(0.1, (T - this.lastTime) / 1000)),
      (this.lastTime = T),
      (this.group.visible = p && this.enabled),
      !this.group.visible)
    ) {
      this.count = 0;
      this.lastCpuMs = 0;
      return false;
    }
    if (this.viewKey !== x) {
      this.viewKey = x;
      this.candidates = this.runs.filter(
        (l) =>
          o.intersectsSphere(l.route.sphere) &&
          i.distanceTo(l.route.sphere.center) - l.route.sphere.radius < 2400,
      );
      this.candidates.sort(
        (l, D) =>
          i.distanceToSquared(l.route.sphere.center) - i.distanceToSquared(D.route.sphere.center),
      );
    }
    for (const l of this.meshes) {
      l.count = 0;
    }
    this.count = 0;
    const w = new Set();
    e: for (let l = 0; l < 2; l++) {
      for (const D of this.candidates) {
        if (this.selected.has(D.id) !== (l === 0)) {
          continue;
        }
        const F = D.route;
        const U = this.progress(D);
        const j = this.count;
        for (let q = 0; q < D.cars && this.count < this.capacity; q++) {
          let N = U - q * 14;
          if (F.loop) {
            N = (N + F.length) % F.length;
          } else if (N < 7 || N > F.length - 7) {
            continue;
          }
          const J = D.direction > 0 ? N : F.length - N;
          TrafficRoutes.sample(F, J, this.point);
          this.sphere.center.set(this.point[0], this.point[1], this.point[2] + 2);
          const se = i.distanceTo(this.sphere.center);
          if (se > 2400 || !o.intersectsSphere(this.sphere)) {
            continue;
          }
          const Z = J + 4 * D.direction;
          const G = J - 4 * D.direction;
          TrafficRoutes.sample(F, F.loop ? (Z + F.length) % F.length : Z, this.front);
          TrafficRoutes.sample(F, F.loop ? (G + F.length) % F.length : G, this.back);
          const re = Math.atan2(this.front[1] - this.back[1], this.front[0] - this.back[0]);
          const ue = Math.cos(re);
          const ce = Math.sin(re);
          const pe = Math.min(1.15, F.gauge / 1.435);
          const de = this.meshes[q === 0 ? 0 : q === D.cars - 1 ? 2 : 1];
          const B = de.count++;
          this.matrix.set(
            ue,
            -ce * pe,
            0,
            this.point[0],
            ce,
            ue * pe,
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
          de.setMatrixAt(B, this.matrix);
          de.geometry.attributes.trainFade.setX(
            B,
            Math.min(
              1,
              F.loop ? 1 : (J - 7) / 8,
              F.loop ? 1 : (F.length - 7 - J) / 8,
              (2400 - se) / 100,
            ),
          );
          this.count++;
        }
        if (
          (this.count > j && w.add(D.id), this.count >= this.capacity || w.size >= this.consists)
        ) {
          break e;
        }
      }
    }
    this.selected = w;
    for (const l of this.meshes) {
      if (l.count) {
        for (const [D, F] of [
          [l.instanceMatrix, 16],
          [l.geometry.attributes.trainFade, 1],
        ]) {
          D.clearUpdateRanges();
          D.addUpdateRange(0, l.count * F);
          D.needsUpdate = true;
        }
      }
    }
    this.lastCpuMs = performance.now() - T;
    return this.moving && this.candidates.length > 0 && !document.hidden;
  }
  dispose() {
    for (const i of this.meshes) {
      i.geometry.dispose();
      i.material.dispose();
      i.dispose();
    }
    this.group.clear();
    TrainAssets.dispose();
  }
}
export { TrainSimulation };

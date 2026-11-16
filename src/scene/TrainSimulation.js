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
    for (const model of TrainAssets.models) {
      const geometry = model.geometry.clone();
      geometry.setAttribute(
        'trainFade',
        new InstancedBufferAttribute(new Float32Array(this.capacity), 1).setUsage(DynamicDrawUsage),
      );
      const material = new MeshLambertMaterial({
        map: model.texture,
      });
      material.onBeforeCompile = (shader) => {
        shader.vertexShader =
          `attribute float trainFade; varying float railFade;
` +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
railFade = trainFade;`,
          );
        shader.fragmentShader =
          `varying float railFade;
` +
          shader.fragmentShader.replace(
            '#include <alphatest_fragment>',
            `#include <alphatest_fragment>
if (railFade < fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453)) discard;`,
          );
      };
      material.customProgramCacheKey = () => 'train-fade';
      const mesh = new InstancedMesh(geometry, material, this.capacity);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.count = 0;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }
  setData(railways) {
    // 路网刷新后投影旧列车位置，保留编组 ID、方向及运动相位。
    const previousRuns = this.runs;
    this.routes = RailwayRoutes.build(railways);
    this.runs = [];
    this.viewKey = '';
    for (const route of this.routes) {
      const bounds = route.bounds;
      route.sphere = new Sphere(
        new Vector3((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2, 2),
        Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]) / 2 + 10,
      );
    }
    const assignedRoutes = new Set();
    for (const run of previousRuns) {
      const progress = this.progress(run);
      const clampedProgress = run.route.loop
        ? progress
        : Math.max(7, Math.min(run.route.length - 7, progress));
      TrafficRoutes.sample(
        run.route,
        run.direction > 0 ? clampedProgress : run.route.length - clampedProgress,
        this.point,
      );
      const heading = this.point[3] + (run.direction < 0 ? Math.PI : 0);
      let closestProjection = null;
      for (const route of this.routes) {
        const bounds = route.bounds;
        if (
          route.type !== run.route.type ||
          route.gauge !== run.route.gauge ||
          this.point[0] < bounds[0] - 0.2 ||
          this.point[0] > bounds[2] + 0.2 ||
          this.point[1] < bounds[1] - 0.2 ||
          this.point[1] > bounds[3] + 0.2
        ) {
          continue;
        }
        const projection = RailwayRoutes.project(route, this.point);
        if (!(
          !projection ||
          projection.error > 0.04 ||
          Math.abs(Math.cos(projection.angle - heading)) < 0.5
        )) {
          if (!closestProjection || projection.error < closestProjection.error) {
            closestProjection = {
              ...projection,
              route: route,
            };
          }
        }
      }
      if (!closestProjection) {
        continue;
      }
      const route = closestProjection.route;
      const direction = Math.cos(closestProjection.angle - heading) >= 0 ? 1 : -1;
      const distance =
        direction > 0 ? closestProjection.distance : route.length - closestProjection.distance;
      const span = route.loop ? route.length : route.length + run.cars * 14 + 25;
      this.runs.push({
        id: run.id,
        route: route,
        direction: direction,
        cars: run.cars,
        span: span,
        phase: distance + progress - clampedProgress - this.clock * route.speed,
      });
      assignedRoutes.add(route);
    }
    for (const route of this.routes) {
      if (!assignedRoutes.has(route)) {
        const span = route.loop ? route.length : route.length + route.cars * 14 + 25;
        this.runs.push({
          id: this.nextId++,
          route: route,
          direction: 1,
          cars: route.cars,
          span: span,
          phase: ((route.seed % 997) / 997) * span,
        });
      }
    }
    if (!this.runs.length) {
      this.selected.clear();
    }
  }
  progress(run) {
    return (((run.phase + this.clock * run.route.speed) % run.span) + run.span) % run.span;
  }
  update(cameraPosition, frustum, visible, viewKey) {
    // 仅在可见且允许运动时推进时钟，避免后台停留后列车大幅跳动。
    const now = performance.now();
    if (
      (visible &&
        this.enabled &&
        this.moving &&
        !document.hidden &&
        (this.clock += Math.min(0.1, (now - this.lastTime) / 1000)),
      (this.lastTime = now),
      (this.group.visible = visible && this.enabled),
      !this.group.visible)
    ) {
      this.count = 0;
      this.lastCpuMs = 0;
      return false;
    }
    if (this.viewKey !== viewKey) {
      this.viewKey = viewKey;
      this.candidates = this.runs.filter(
        (run) =>
          frustum.intersectsSphere(run.route.sphere) &&
          cameraPosition.distanceTo(run.route.sphere.center) - run.route.sphere.radius < 2400,
      );
      this.candidates.sort(
        (firstRun, secondRun) =>
          cameraPosition.distanceToSquared(firstRun.route.sphere.center) -
          cameraPosition.distanceToSquared(secondRun.route.sphere.center),
      );
    }
    for (const mesh of this.meshes) {
      mesh.count = 0;
    }
    this.count = 0;
    const selectedIds = new Set();
    // 两轮分配先保留上帧已选编组，达到实例或编组上限时退出整个选择循环。
    e: for (let priorityPass = 0; priorityPass < 2; priorityPass++) {
      for (const run of this.candidates) {
        if (this.selected.has(run.id) !== (priorityPass === 0)) {
          continue;
        }
        const route = run.route;
        const progress = this.progress(run);
        const countBeforeRun = this.count;
        for (let carIndex = 0; carIndex < run.cars && this.count < this.capacity; carIndex++) {
          // 车厢沿弧长依次后移；闭环取模，开放路线在端点外暂时隐藏。
          let carProgress = progress - carIndex * 14;
          if (route.loop) {
            carProgress = (carProgress + route.length) % route.length;
          } else if (carProgress < 7 || carProgress > route.length - 7) {
            continue;
          }
          const distance = run.direction > 0 ? carProgress : route.length - carProgress;
          TrafficRoutes.sample(route, distance, this.point);
          this.sphere.center.set(this.point[0], this.point[1], this.point[2] + 2);
          const cameraDistance = cameraPosition.distanceTo(this.sphere.center);
          if (cameraDistance > 2400 || !frustum.intersectsSphere(this.sphere)) {
            continue;
          }
          const frontDistance = distance + 4 * run.direction;
          const backDistance = distance - 4 * run.direction;
          TrafficRoutes.sample(
            route,
            route.loop ? (frontDistance + route.length) % route.length : frontDistance,
            this.front,
          );
          TrafficRoutes.sample(
            route,
            route.loop ? (backDistance + route.length) % route.length : backDistance,
            this.back,
          );
          const heading = Math.atan2(this.front[1] - this.back[1], this.front[0] - this.back[0]);
          const headingCos = Math.cos(heading);
          const headingSin = Math.sin(heading);
          const gaugeScale = Math.min(1.15, route.gauge / 1.435);
          const mesh = this.meshes[carIndex === 0 ? 0 : carIndex === run.cars - 1 ? 2 : 1];
          const instanceIndex = mesh.count++;
          this.matrix.set(
            headingCos,
            -headingSin * gaugeScale,
            0,
            this.point[0],
            headingSin,
            headingCos * gaugeScale,
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
          mesh.setMatrixAt(instanceIndex, this.matrix);
          mesh.geometry.attributes.trainFade.setX(
            instanceIndex,
            Math.min(
              1,
              route.loop ? 1 : (distance - 7) / 8,
              route.loop ? 1 : (route.length - 7 - distance) / 8,
              (2400 - cameraDistance) / 100,
            ),
          );
          this.count++;
        }
        if (
          (this.count > countBeforeRun && selectedIds.add(run.id),
          this.count >= this.capacity || selectedIds.size >= this.consists)
        ) {
          break e;
        }
      }
    }
    this.selected = selectedIds;
    for (const mesh of this.meshes) {
      if (mesh.count) {
        for (const [attribute, itemSize] of [
          [mesh.instanceMatrix, 16],
          [mesh.geometry.attributes.trainFade, 1],
        ]) {
          attribute.clearUpdateRanges();
          attribute.addUpdateRange(0, mesh.count * itemSize);
          attribute.needsUpdate = true;
        }
      }
    }
    this.lastCpuMs = performance.now() - now;
    return this.moving && this.candidates.length > 0 && !document.hidden;
  }
  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    }
    this.group.clear();
    TrainAssets.dispose();
  }
}
export { TrainSimulation };

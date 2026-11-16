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
    ].map((o) => new Color(o));
    this.texture = TrafficSimulation.texture();
    this.material = new MeshLambertMaterial({
      map: this.texture,
      side: DoubleSide,
    });
    this.material.onBeforeCompile = (o) => {
      o.vertexShader =
        `attribute float paintMask; attribute float vehicleFade; varying float carFade;
` +
        o.vertexShader
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
      o.fragmentShader =
        `varying float carFade;
` +
        o.fragmentShader.replace(
          '#include <alphatest_fragment>',
          `#include <alphatest_fragment>
if (carFade < fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453)) discard;`,
        );
    };
    this.material.customProgramCacheKey = () => 'car-paint-fade-v1';
    this.meshes = [];
    for (let o = 0; o < 2; o++) {
      const p = ModelAssets.geometry(`car/${o}`);
      p.setAttribute(
        'vehicleFade',
        new InstancedBufferAttribute(new Float32Array(this.capacity), 1).setUsage(DynamicDrawUsage),
      );
      const x = new InstancedMesh(p, this.material, this.capacity);
      x.instanceMatrix.setUsage(DynamicDrawUsage);
      x.setColorAt(0, this.palette[0]);
      x.instanceColor.setUsage(DynamicDrawUsage);
      x.receiveShadow = true;
      x.frustumCulled = false;
      x.count = 0;
      this.meshes.push(x);
      this.group.add(x);
    }
    const i = new PlaneGeometry(5.1, 2.5);
    i.setAttribute(
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
    this.shadow = new InstancedMesh(i, this.shadowMaterial, this.capacity);
    this.shadow.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shadow.frustumCulled = false;
    this.shadow.count = 0;
    this.group.add(this.shadow);
  }
  setData(i) {
    this.routes = i;
    for (const o of i) {
      const p = o.bounds;
      o.sphere = new Sphere(
        new Vector3((p[0] + p[2]) / 2, (p[1] + p[3]) / 2, o.points[2]),
        Math.hypot(p[2] - p[0], p[3] - p[1]) / 2 + 4,
      );
    }
    this.viewKey = '';
    this.candidates = [];
  }
  update(i, o, p, x, T, w) {
    const l = performance.now();
    if (
      (this.moving &&
        x &&
        this.enabled &&
        !document.hidden &&
        (this.clock += Math.min(0.1, (l - this.lastTime) / 1000)),
      (this.lastTime = l),
      (this.group.visible = x && this.enabled),
      !this.group.visible)
    ) {
      this.lastCpuMs = 0;
      return false;
    }
    if (w !== this.viewKey) {
      this.viewKey = w;
      this.candidates = this.routes.filter(
        (F) =>
          o.intersectsSphere(F.sphere) && i.distanceTo(F.sphere.center) - F.sphere.radius < 1200,
      );
      this.candidates.sort(
        (F, U) => i.distanceToSquared(F.sphere.center) - i.distanceToSquared(U.sphere.center),
      );
    }
    for (const F of this.meshes) {
      F.count = 0;
    }
    this.shadow.count = 0;
    let D = 0;
    for (const F of this.candidates) {
      for (let U = 0; U < F.count && D < this.capacity; U++) {
        const j =
          (((F.seed % 997) / 997) * F.length + (U * F.length) / F.count + this.clock * F.speed) %
          F.length;
        TrafficRoutes.sample(F, j, this.point);
        this.sphere.center.set(this.point[0], this.point[1], this.point[2] + 0.8);
        const q = i.distanceTo(this.sphere.center);
        if (q > 1200 || (4.5 * p) / Math.max(1, q) < 3 || !o.intersectsSphere(this.sphere)) {
          continue;
        }
        TrafficRoutes.sample(F, Math.max(0, j - 1.3), this.before);
        TrafficRoutes.sample(F, Math.min(F.length, j + 1.3), this.after);
        const N = Math.atan2(this.after[1] - this.before[1], this.after[0] - this.before[0]);
        const J = Math.cos(N);
        const se = Math.sin(N);
        const Z = Math.atan2(
          this.after[2] - this.before[2],
          Math.hypot(this.after[0] - this.before[0], this.after[1] - this.before[1]),
        );
        const G = Math.sin(Z);
        const re = Math.cos(Z);
        const ue = Math.min(1, j / 5, (F.length - j) / 5, Math.max(0, (1200 - q) / 100));
        const ce = this.meshes[(F.seed + U) % 2];
        const pe = ce.count++;
        this.matrix.set(
          J * re,
          -se,
          -J * G,
          this.point[0],
          se * re,
          J,
          -se * G,
          this.point[1],
          G,
          0,
          re,
          this.point[2],
          0,
          0,
          0,
          1,
        );
        ce.setMatrixAt(pe, this.matrix);
        ce.setColorAt(pe, this.palette[(F.seed + U * 3) % this.palette.length]);
        ce.geometry.attributes.vehicleFade.setX(pe, ue);
        this.matrix.elements[14] += 0.014;
        this.shadow.setMatrixAt(D, this.matrix);
        this.shadow.geometry.attributes.vehicleFade.setX(D, ue);
        D++;
      }
      if (D === this.capacity) {
        break;
      }
    }
    this.shadow.count = D;
    this.shadow.visible = T;
    for (const F of [...this.meshes, this.shadow]) {
      for (const [U, j] of [
        [F.instanceMatrix, 16],
        [F.instanceColor, 3],
        [F.geometry.attributes.vehicleFade, 1],
      ]) {
        if (!(!U || !F.count)) {
          U.clearUpdateRanges();
          U.addUpdateRange(0, F.count * j);
          U.needsUpdate = true;
        }
      }
    }
    this.count = D;
    this.lastCpuMs = performance.now() - l;
    return this.moving && this.candidates.length > 0 && !document.hidden;
  }
  static texture() {
    const i = document.createElement('canvas');
    i.width = 1024;
    i.height = 128;
    const o = i.getContext('2d');
    const p = [
      ['#e5e8eb', '#ffffff'],
      ['#182c39', '#90bac8'],
      ['#151a20', '#30363c'],
      ['#697983', '#e0e9ea'],
      ['#efdfaf', '#ffffe4'],
      ['#761c20', '#ef5a42'],
      ['#161e26', '#38434c'],
      ['#243a55', '#a4d0e3'],
    ];
    for (let T = 0; T < p.length; T++) {
      const w = T * 128;
      const l = o.createLinearGradient(w, 128, w + 80, 0);
      if (
        (l.addColorStop(0, p[T][0]),
        l.addColorStop(0.6, p[T][1]),
        l.addColorStop(1, p[T][0]),
        (o.fillStyle = l),
        o.fillRect(w, 0, 128, 128),
        T === 1 &&
          ((o.strokeStyle = '#cce5e8'),
          (o.lineWidth = 4),
          o.beginPath(),
          o.moveTo(w + 14, 100),
          o.lineTo(w + 84, 15),
          o.moveTo(w + 26, 110),
          o.lineTo(w + 96, 25),
          o.stroke(),
          (o.strokeStyle = '#101b24'),
          (o.lineWidth = 7),
          o.strokeRect(w + 8, 8, 112, 112)),
        [2, 4, 5, 6].includes(T))
      ) {
        o.fillStyle = T === 6 ? '#91a1aa' : '#ffffff20';
        for (let D = 12; D < 120; D += T === 6 ? 12 : 7) {
          o.fillRect(w + 10, D, 108, 2);
        }
      }
    }
    const x = new CanvasTexture(i);
    x.colorSpace = SRGBColorSpace;
    x.anisotropy = 2;
    return x;
  }
  dispose() {
    for (const i of [...this.meshes, this.shadow]) {
      i.geometry.dispose();
      i.dispose();
    }
    this.material.dispose();
    this.shadowMaterial.dispose();
    this.texture.dispose();
    this.group.clear();
  }
}
export { TrafficSimulation };

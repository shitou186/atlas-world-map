// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import {
  Scene,
  Camera,
  Group,
  Raycaster,
  Frustum,
  Vector3,
  Matrix4,
  WebGLRenderer,
  PCFShadowMap,
  NoToneMapping,
  SRGBColorSpace,
  HemisphereLight,
  DirectionalLight,
  Mesh,
  PlaneGeometry,
  ShadowMaterial,
  MeshDepthMaterial,
  RGBADepthPacking,
  BufferGeometry,
  BufferAttribute,
  DynamicDrawUsage,
  Sphere,
  MeshStandardMaterial,
  DoubleSide,
  BoxGeometry,
  MeshLambertMaterial,
  InstancedMesh,
  Object3D,
  InstancedBufferAttribute,
  MeshBasicMaterial,
  FrontSide,
} from 'three';
import { RevealAnimation } from './RevealAnimation.js';
import { TreeLod } from './TreeLod.js';
import { RenderMetrics } from './RenderMetrics.js';
import { TrafficSimulation } from './TrafficSimulation.js';
import { BoatSimulation } from './BoatSimulation.js';
import { TrainSimulation } from './TrainSimulation.js';
import { WaterMaterial } from './WaterMaterial.js';
import maplibregl from 'maplibre-gl';
import { ModelAssets } from '../models/ModelAssets.js';
import SunCalc from 'suncalc';
class MapScene {
  constructor() {
    this.id = 'atlas-scene';
    this.type = 'custom';
    this.renderingMode = '3d';
    this.scene = new Scene();
    this.camera = new Camera();
    this.camera.matrixAutoUpdate = false;
    this.camera.matrixWorldAutoUpdate = false;
    this.root = new Group();
    this.scene.add(this.root);
    this.anchor = [0, 0];
    this.features = [];
    this.tiles = new Map();
    this.routesTimer = null;
    this.hour = 14;
    this.enabled = true;
    this.shadows = true;
    this.startTime = performance.now();
    this.raycaster = new Raycaster();
    this.seen = new Set();
    this.motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.wind = true;
    this.windTime = {
      value: 0,
    };
    this.revealAnimation = new RevealAnimation(this.seen);
    this.sceneAge = this.revealAnimation.time;
    this.treeLod = new TreeLod();
    this.treeBatches = [];
    this.lampBatches = [];
    this.furnitureTemplates = new Map();
    this.frustum = new Frustum();
    this.cameraPosition = new Vector3();
    this.frameMatrix = new Matrix4();
    this.frameCount = 0;
    this.shadowCount = 0;
    this.treeDetail = 'auto';
    this.visibility = {
      buildings: true,
      vegetation: true,
      roads: true,
      lamps: true,
    };
  }
  onAdd(map, gl) {
    this.map = map;
    this.gl = gl;
    if (new URLSearchParams(location.search).has('profile')) {
      this.renderMetrics = new RenderMetrics(gl, map.getCanvas());
    }
    this.renderer = new WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
    });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.sky = new HemisphereLight(15791615, 11970704, 1.2);
    this.sky.position.set(0, 0, 1);
    this.sun = new DirectionalLight(16773334, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.up.set(0, 0, 1);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 3500;
    this.sun.shadow.bias = -0.00012;
    this.sun.shadow.normalBias = 0.45;
    this.scene.add(this.sky, this.sun, this.sun.target);
    this.ground = new Mesh(
      new PlaneGeometry(5000, 5000),
      new ShadowMaterial({
        opacity: 0.27,
        depthWrite: false,
      }),
    );
    this.ground.receiveShadow = true;
    this.ground.position.z = 0.01;
    this.scene.add(this.ground);
    this.traffic = new TrafficSimulation();
    this.scene.add(this.traffic.group);
    this.boats = new BoatSimulation();
    this.scene.add(this.boats.group);
    this.trains = new TrainSimulation();
    this.scene.add(this.trains.group);
    this.waterMaterial = new WaterMaterial(map, this.cameraPosition);
    this.setSun(this.hour);
  }
  clear() {
    clearTimeout(this.routesTimer);
    this.routesTimer = null;
    this.revealAnimation.clear();
    this.root.traverse((i) => {
      i.geometry?.dispose();
      i.material?.dispose();
      i.customDepthMaterial?.dispose();
      i.dispose?.();
    });
    this.root.clear();
    this.tiles.clear();
    this.localMatrix = null;
    this.buildings = null;
    this.features = [];
    this.treeBatches.length = 0;
    this.lampBatches.length = 0;
    this.traffic?.setData([]);
    this.boats?.setData([]);
    this.trains?.setData([]);
  }
  removeTile(key) {
    const o = this.tiles.get(key);
    if (!o) {
      return;
    }
    const p = new Set(o.animations);
    const x = new Set(o.trees);
    const T = new Set(o.lamps);
    for (const w of ['entries', 'pending', 'active']) {
      this.revealAnimation[w] = this.revealAnimation[w].filter((l) => !p.has(l));
    }
    this.treeBatches = this.treeBatches.filter((w) => !x.has(w));
    this.lampBatches = this.lampBatches.filter((w) => !T.has(w));
    o.group.traverse((w) => {
      w.geometry?.dispose();
      w.material?.dispose();
      w.customDepthMaterial?.dispose();
      w.dispose?.();
    });
    this.root.remove(o.group);
    this.tiles.delete(key);
    this.lodKey = '';
    this.updateRoutes();
    this.renderer.shadowMap.needsUpdate = true;
  }
  updateRoutes() {
    if (!this.routesTimer) {
      this.routesTimer = setTimeout(() => {
        if (((this.routesTimer = null), this.map.isMoving())) {
          this.updateRoutes();
          return;
        }
        const i = new Map();
        const o = new Map();
        const p = [];
        for (const x of this.tiles.values()) {
          for (const T of x.routes) {
            if (!i.has(T.id)) {
              i.set(T.id, T);
            }
          }
          for (const T of x.boats) {
            if (!o.has(T.id)) {
              o.set(T.id, T);
            }
          }
          p.push(...x.railways);
        }
        this.traffic.setData([...i.values()]);
        this.boats.setData([...o.values()]);
        this.trains.setData(p);
        this.map.triggerRepaint();
      }, 250);
    }
  }
  animateMesh(i, o = false) {
    const p = i.material;
    const x = `
      float elapsed = max(0.0, sceneAge - revealDelay);
      float growth = elapsed >= 1.5 ? 1.0 : clamp(1.0 - exp(-5.8 * elapsed) * (cos(9.0 * elapsed) + 0.64 * sin(9.0 * elapsed)), 0.0, 1.08);
      growth = mix(1.0, growth, revealEnabled);
      transformed.z *= growth;
      ${o ? 'transformed.xy *= mix(0.65, 1.0, growth); transformed.x += sin(windTime * 1.3 + position.z * 0.7 + revealDelay * 12.0) * position.z * position.z * 0.0018 * growth;' : ''}
    `;
    const T = new MeshDepthMaterial({
      depthPacking: RGBADepthPacking,
      side: i.material.side,
      map: i.material.map,
      alphaTest: i.material.alphaTest,
    });
    i.customDepthMaterial = T;
    for (const w of [i.material, T]) {
      w.onBeforeCompile = (l) => {
        l.uniforms.sceneAge = this.sceneAge;
        l.uniforms.windTime = this.windTime;
        l.uniforms.revealEnabled = this.revealAnimation.enabled;
        l.vertexShader =
          `uniform float sceneAge; uniform float windTime; uniform float revealEnabled; attribute float revealDelay;
` +
          l.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
` + x,
          );
        if (i.geometry.hasAttribute('surfaceMaterial') && w === p) {
          l.vertexShader =
            `attribute vec3 surfaceMaterial; varying vec3 vSurfaceMaterial;
` +
            l.vertexShader.replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
vSurfaceMaterial = surfaceMaterial;`,
            );
          l.fragmentShader =
            `varying vec3 vSurfaceMaterial;
` +
            l.fragmentShader
              .replace(
                '#include <roughnessmap_fragment>',
                `#include <roughnessmap_fragment>
roughnessFactor = vSurfaceMaterial.y;`,
              )
              .replace(
                '#include <metalnessmap_fragment>',
                `#include <metalnessmap_fragment>
metalnessFactor = vSurfaceMaterial.z;`,
              )
              .replace(
                '#include <lights_physical_fragment>',
                `#include <lights_physical_fragment>
material.specularColor = mix(vec3(vSurfaceMaterial.x), diffuseColor.rgb * vSurfaceMaterial.x, metalnessFactor);`,
              );
        }
      };
      w.customProgramCacheKey = () =>
        o
          ? 'tree-motion-v2'
          : i.geometry.hasAttribute('surfaceMaterial')
            ? 'building-material-v3'
            : 'building-motion-v2';
    }
    this.shadowMesh(i);
  }
  shadowMesh(i) {
    i.onBeforeShadow = () => this.gl.depthRange(0, 1);
    i.onAfterShadow = () => {
      this.gl.depthRange(this.mapDepthRange[0], this.mapDepthRange[1]);
      this.shadowTriangles = this.renderer.info.render.triangles;
      this.shadowDrawCalls = this.renderer.info.render.calls;
    };
  }
  reveal(i, o, p) {
    let x = 0;
    for (const T of i) {
      x = (Math.imul(x, 31) + T.charCodeAt(0)) | 0;
    }
    return Math.min(0.75, Math.hypot(o, p) / 1300) + ((x >>> 0) % 200) / 1000;
  }
  replay() {
    this.revealAnimation.replay();
    this.map.triggerRepaint();
  }
  setVisible(kind, visible) {
    this.visibility[kind] = visible;
    this.root.traverse((p) => {
      if (p.userData.kind === kind && p.userData.lod === void 0) {
        p.visible = visible;
      }
    });
    this.lodKey = '';
    this.revealAnimation.viewKey = '';
    this.renderer.shadowMap.needsUpdate = true;
    this.map.triggerRepaint();
  }
  *prepareTile(i, o) {
    const p = performance.now();
    if (!this.localMatrix) {
      this.anchor = o.anchor;
    }
    const x = this.anchor;
    const T = Math.cos((x[1] * Math.PI) / 180) / Math.cos((o.anchor[1] * Math.PI) / 180);
    const l =
      (((((o.anchor[0] - x[0] + 540) % 360) - 180) * Math.PI) / 180) *
      6378137 *
      Math.cos((x[1] * Math.PI) / 180);
    const D =
      (Math.log(Math.tan(Math.PI / 4 + (o.anchor[1] * Math.PI) / 360)) -
        Math.log(Math.tan(Math.PI / 4 + (x[1] * Math.PI) / 360))) *
      6378137 *
      Math.cos((x[1] * Math.PI) / 180);
    const F = new Group();
    F.position.set(l, D, 0);
    F.scale.set(T, T, 1);
    F.updateMatrix();
    const U = {
      group: F,
      data: o,
      buildings: null,
      trees: [],
      lamps: [],
      animations: [],
      routes: [],
      boats: [],
      railways: [],
    };
    this.tiles.set(i, U);
    this.root.add(F);
    const j = maplibregl.MercatorCoordinate.fromLngLat(x);
    const q = j.meterInMercatorCoordinateUnits();
    const N = 1 / (2 * Math.PI * 6378137 * Math.cos((x[1] * Math.PI) / 180));
    if (
      ((this.localMatrix = new Matrix4().makeTranslation(j.x, j.y, 0).scale(new Vector3(N, -N, q))),
      o.positions.length)
    ) {
      const G = new BufferGeometry();
      G.setAttribute('position', new BufferAttribute(o.positions, 3));
      G.setAttribute('color', new BufferAttribute(o.colors, 3));
      G.setAttribute('surfaceMaterial', new BufferAttribute(o.materials, 3));
      G.setAttribute('normal', new BufferAttribute(o.normals, 3));
      G.setIndex(new BufferAttribute(o.indices, 1));
      G.computeBoundingBox();
      G.computeBoundingSphere();
      const re = new Float32Array(o.positions.length / 3);
      const ue = new BufferAttribute(re, 1).setUsage(DynamicDrawUsage);
      for (const pe of o.features) {
        const de = pe.startVertex * 3;
        const B = this.reveal(pe.id, o.positions[de], o.positions[de + 1]);
        const ie = pe.bounds;
        const Y = new Sphere(
          new Vector3((ie[0] + ie[3]) / 2, (ie[1] + ie[4]) / 2, (ie[2] + ie[5]) / 2),
          (Math.hypot(ie[3] - ie[0], ie[4] - ie[1], ie[5] - ie[2]) / 2) * 1.08,
        );
        Y.applyMatrix4(F.matrix);
        U.animations.push(
          this.revealAnimation.add(pe.id, 'buildings', Y, ue, pe.startVertex, pe.vertexCount, B),
        );
      }
      G.setAttribute('revealDelay', ue);
      const ce = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.87,
        metalness: 0,
        side: DoubleSide,
      });
      U.buildings = new Mesh(G, ce);
      U.buildings.castShadow = true;
      U.buildings.receiveShadow = true;
      U.buildings.userData = {
        kind: 'buildings',
        features: o.features,
      };
      U.buildings.visible = this.visibility.buildings;
      this.animateMesh(U.buildings);
      F.add(U.buildings);
      yield;
    }
    for (const [G, re] of Object.entries(o.surfaces || {})) {
      if (!re.positions.length) {
        continue;
      }
      const ue = new BufferGeometry();
      ue.setAttribute('position', new BufferAttribute(re.positions, 3));
      ue.setAttribute('color', new BufferAttribute(re.colors, 3));
      ue.setAttribute('normal', new BufferAttribute(re.normals, 3));
      ue.setIndex(new BufferAttribute(re.indices, 1));
      const ce = ['structures', 'fenceMesh'].includes(G);
      const de = G === 'grass' ? 1 : G === 'markings' || G === 'sportLines' ? 4 : 3;
      const B = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.94,
        side: DoubleSide,
        polygonOffset: !ce,
        polygonOffsetFactor: 0,
        polygonOffsetUnits: -de,
      });
      B.onBeforeCompile = (Y) => {
        Y.vertexShader =
          `varying vec3 surfacePoint;
` +
          Y.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
surfacePoint = ` +
              (G === 'fenceMesh'
                ? 'vec3(dot(position.xy, vec2(-normal.y, normal.x)), 0.0, position.z);'
                : 'position;'),
          );
        const K =
          G === 'paving' || G === 'curb'
            ? 'vec2 tile = abs(fract(surfacePoint.xy * vec2(1.7, 3.4)) - 0.5); float seam = smoothstep(0.46, 0.49, max(tile.x, tile.y)); diffuseColor.rgb *= 1.0 - seam * 0.16;'
            : G === 'fenceMesh'
              ? 'vec2 grid = vec2(surfacePoint.x + surfacePoint.z, surfacePoint.x - surfacePoint.z) * 10.0; vec2 distance = abs(fract(grid + 0.5) - 0.5); vec2 aa = max(fwidth(grid), vec2(0.001)); float wire = 1.0 - smoothstep(0.025, 0.025 + min(aa.x, aa.y), min(distance.x, distance.y)); if (wire < 0.45) discard;'
              : ['markings', 'structures', 'sport', 'sportLines'].includes(G)
                ? ''
                : 'vec2 grainPoint = surfacePoint.xy * 65.0; float grain = fract(sin(dot(floor(grainPoint), vec2(12.9898,78.233))) * 43758.5453); float detailFade = 1.0 - smoothstep(0.25, 1.0, max(fwidth(grainPoint.x), fwidth(grainPoint.y))); diffuseColor.rgb *= 1.0 + (grain - 0.5) * 0.09 * detailFade;';
        Y.fragmentShader =
          `varying vec3 surfacePoint;
` +
          Y.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
` + K,
          );
      };
      B.customProgramCacheKey = () => `surface-${G}`;
      const ie = new Mesh(ue, B);
      ie.castShadow = G === 'structures';
      if (ie.castShadow) {
        this.shadowMesh(ie);
      }
      ie.renderOrder = ce ? 0 : de;
      ie.receiveShadow = true;
      ie.userData.kind = G === 'grass' ? 'vegetation' : 'roads';
      ie.visible = this.visibility[ie.userData.kind];
      F.add(ie);
      yield;
    }
    if (o.sleepers.length) {
      const G = new BoxGeometry(1, 0.21, 0.1);
      const re = new MeshLambertMaterial({
        color: '#817b6c',
      });
      const ue = new InstancedMesh(G, re, o.sleepers.length / 4);
      const ce = new Object3D();
      for (let pe = 0; pe < ue.count; pe++) {
        const de = pe * 4;
        ce.position.set(o.sleepers[de], o.sleepers[de + 1], 0.13);
        ce.rotation.z = o.sleepers[de + 2];
        ce.scale.x = o.sleepers[de + 3];
        ce.updateMatrix();
        ue.setMatrixAt(pe, ce.matrix);
        if (pe % 512 === 511) {
          yield;
        }
      }
      ue.computeBoundingSphere();
      ue.receiveShadow = true;
      ue.userData.kind = 'roads';
      ue.visible = this.visibility.roads;
      F.add(ue);
      yield;
    }
    const J = new Map();
    for (const G of o.trees || []) {
      const re = `${G.variant}/${Math.floor(G.x / 160)}/${Math.floor(G.y / 160)}`;
      if (!J.has(re)) {
        J.set(re, []);
      }
      J.get(re).push(G);
    }
    for (const G of J.values()) {
      const re = G[0].variant;
      const ue = this.treeLod.create(re, this.renderer, this.gl);
      const ce = new Object3D();
      const pe = new InstancedBufferAttribute(new Float32Array(G.length), 1).setUsage(
        DynamicDrawUsage,
      );
      for (let B = 0; B < G.length; B++) {
        const ie = G[B];
        const Y = new Sphere(
          new Vector3(ie.x, ie.y, ie.height / 2),
          Math.hypot(ie.crown / 2, ie.height / 2) * 1.1,
        );
        Y.applyMatrix4(F.matrix);
        U.animations.push(
          this.revealAnimation.add(
            ie.id,
            'vegetation',
            Y,
            pe,
            B,
            1,
            this.reveal(ie.id, Y.center.x, Y.center.y),
          ),
        );
      }
      const de = {
        levels: [[], [], []],
        level: -1,
        sphere: null,
        crown: 0,
        count: G.length,
      };
      for (const B of G) {
        de.crown = Math.max(de.crown, B.crown);
      }
      for (let B = 0; B < 3; B++) {
        for (const [ie, Y] of Object.entries(ue.levels[B])) {
          const K = new BufferGeometry();
          for (const [Re, Se] of Object.entries(Y.attributes)) {
            K.setAttribute(Re, Se);
          }
          if (Y.index) {
            K.setIndex(Y.index);
          }
          K.boundingSphere = Y.boundingSphere.clone();
          K.setAttribute('revealDelay', pe);
          const ae =
            B === 2
              ? new MeshBasicMaterial({
                  map: ue.atlas.texture,
                  alphaTest: 0.28,
                  side: FrontSide,
                })
              : new MeshLambertMaterial({
                  vertexColors: true,
                  side: DoubleSide,
                });
          const we = new InstancedMesh(K, ae, G.length);
          for (let Re = 0; Re < G.length; Re++) {
            const Se = G[Re];
            ce.position.set(Se.x, Se.y, 0.04);
            ce.rotation.set(0, 0, Se.angle);
            ce.scale.set(Se.crown / 6.2, Se.crown / 6.2, Se.height / 10);
            ce.updateMatrix();
            we.setMatrixAt(Re, ce.matrix);
          }
          we.castShadow = true;
          we.receiveShadow = true;
          we.computeBoundingSphere();
          we.boundingSphere.radius += 3;
          we.userData = {
            kind: 'vegetation',
            lod: B,
          };
          we.visible = false;
          this.animateMesh(we, true);
          F.add(we);
          de.levels[B].push(we);
          if (de.sphere) {
            de.sphere.union(we.boundingSphere);
          } else {
            de.sphere = we.boundingSphere.clone();
          }
        }
      }
      de.sphere.applyMatrix4(F.matrix);
      this.treeBatches.push(de);
      U.trees.push(de);
      yield;
    }
    const se = new Map();
    for (const G of o.lamps || []) {
      const re = `${Math.floor(G.x / 240)}/${Math.floor(G.y / 240)}`;
      if (!se.has(re)) {
        se.set(re, []);
      }
      se.get(re).push(G);
    }
    if (se.size) {
      this.lampTemplate ||= ModelAssets.geometry('lamp');
    }
    for (const G of se.values()) {
      const re = new BufferGeometry();
      for (const [B, ie] of Object.entries(this.lampTemplate.attributes)) {
        re.setAttribute(B, ie);
      }
      re.boundingSphere = this.lampTemplate.boundingSphere.clone();
      const ue = new InstancedBufferAttribute(new Float32Array(G.length), 1).setUsage(
        DynamicDrawUsage,
      );
      re.setAttribute('revealDelay', ue);
      const ce = new MeshLambertMaterial({
        vertexColors: true,
      });
      const pe = new InstancedMesh(re, ce, G.length);
      const de = new Object3D();
      for (let B = 0; B < G.length; B++) {
        const ie = G[B];
        de.position.set(ie.x, ie.y, ie.z);
        de.rotation.set(0, 0, ie.angle);
        de.scale.set(1, 1, ie.height / 8);
        de.updateMatrix();
        pe.setMatrixAt(B, de.matrix);
        const Y = new Sphere(
          new Vector3(ie.x, ie.y, ie.z + ie.height / 2),
          Math.hypot(2.6, ie.height / 2) * 1.1,
        );
        Y.applyMatrix4(F.matrix);
        U.animations.push(
          this.revealAnimation.add(
            ie.id,
            'lamps',
            Y,
            ue,
            B,
            1,
            this.reveal(ie.id, Y.center.x, Y.center.y),
          ),
        );
      }
      pe.computeBoundingSphere();
      pe.boundingSphere.radius += 1;
      pe.castShadow = true;
      pe.receiveShadow = true;
      pe.userData.kind = 'lamps';
      pe.visible = this.visibility.lamps;
      pe.userData.worldSphere = pe.boundingSphere.clone().applyMatrix4(F.matrix);
      this.animateMesh(pe);
      F.add(pe);
      this.lampBatches.push(pe);
      U.lamps.push(pe);
      yield;
    }
    const Z = new Map();
    for (const G of o.furniture) {
      const re = `${G.kind}/${Math.floor(G.x / 120)}/${Math.floor(G.y / 120)}`;
      if (!Z.has(re)) {
        Z.set(re, []);
      }
      Z.get(re).push(G);
    }
    for (const G of Z.values()) {
      const re = G[0].kind;
      if (!this.furnitureTemplates.has(re)) {
        this.furnitureTemplates.set(re, ModelAssets.geometry(re));
      }
      const ue = this.furnitureTemplates.get(re);
      const ce = new BufferGeometry();
      for (const [ie, Y] of Object.entries(ue.attributes)) {
        ce.setAttribute(ie, Y);
      }
      ce.boundingSphere = ue.boundingSphere.clone();
      const pe = new InstancedBufferAttribute(new Float32Array(G.length), 1).setUsage(
        DynamicDrawUsage,
      );
      ce.setAttribute('revealDelay', pe);
      const de = new InstancedMesh(
        ce,
        new MeshLambertMaterial({
          vertexColors: true,
          side: DoubleSide,
        }),
        G.length,
      );
      const B = new Object3D();
      for (let ie = 0; ie < G.length; ie++) {
        const Y = G[ie];
        B.position.set(Y.x, Y.y, Y.z);
        B.rotation.set(0, 0, Y.angle);
        B.updateMatrix();
        de.setMatrixAt(ie, B.matrix);
        const K = ue.boundingSphere.clone().applyMatrix4(B.matrix).applyMatrix4(F.matrix);
        K.radius *= 1.08;
        U.animations.push(
          this.revealAnimation.add(
            Y.id,
            'roads',
            K,
            pe,
            ie,
            1,
            this.reveal(Y.id, K.center.x, K.center.y),
          ),
        );
      }
      de.computeBoundingSphere();
      de.castShadow = true;
      de.receiveShadow = true;
      de.userData.kind = 'roads';
      de.visible = this.visibility.roads;
      this.animateMesh(de);
      F.add(de);
      yield;
    }
    for (this.lodKey = ''; this.seen.size > 150000;) {
      this.seen.delete(this.seen.values().next().value);
    }
    if (o.water.length) {
      const G = new BufferGeometry();
      G.setAttribute('position', new BufferAttribute(o.water, 3));
      G.setAttribute('normal', new BufferAttribute(o.waterNormals, 3));
      G.setIndex(new BufferAttribute(o.waterIndices, 1));
      const re = this.waterMaterial.create();
      const ue = new Mesh(G, re);
      ue.renderOrder = 2;
      G.computeBoundingSphere();
      U.water = G.boundingSphere.clone().applyMatrix4(F.matrix);
      ue.receiveShadow = true;
      F.add(ue);
    }
    for (const G of ['traffic', 'boats']) {
      for (const re of o[G] || []) {
        const ue = re.points.slice();
        for (let de = 0; de < ue.length; de += 3) {
          ue[de] = ue[de] * T + l;
          ue[de + 1] = ue[de + 1] * T + D;
        }
        const ce = re.bounds;
        const pe = {
          ...re,
          points: ue,
          distances: re.distances.map((de) => de * T),
          length: re.length * T,
          bounds: [ce[0] * T + l, ce[1] * T + D, ce[2] * T + l, ce[3] * T + D],
        };
        U[G === 'traffic' ? 'routes' : 'boats'].push(pe);
      }
    }
    for (const G of o.railways) {
      const re = G.points.slice();
      for (let ue = 0; ue < re.length; ue += 3) {
        re[ue] = re[ue] * T + l;
        re[ue + 1] = re[ue + 1] * T + D;
      }
      U.railways.push({
        ...G,
        points: re,
      });
    }
    this.updateRoutes();
    this.revealAnimation.viewKey = '';
    this.setSun(this.hour);
    this.map.triggerRepaint();
    this.metrics?.record('sceneCommit', {
      duration: performance.now() - p,
      moving: this.map.isMoving(),
    });
  }
  setSun(hour) {
    if (((this.hour = hour), !this.sun)) {
      return;
    }
    const o = new Date();
    o.setUTCHours(0, 0, 0, 0);
    o.setTime(o.getTime() + (hour - this.anchor[0] / 15) * 3600000);
    const p = SunCalc.getPosition(o, this.anchor[1], this.anchor[0]);
    const x = Math.max(0.02, p.altitude);
    const T = new Vector3(
      -Math.sin(p.azimuth) * Math.cos(x),
      -Math.cos(p.azimuth) * Math.cos(x),
      Math.sin(x),
    );
    this.waterMaterial.uniforms.waterSun.value.copy(T);
    const w = this.map.getCenter();
    const l = Math.min(1300, Math.max(180, 750 * 2 ** (17 - this.map.getZoom())));
    const D = Math.cos((this.anchor[1] * Math.PI) / 180);
    const F = (((w.lng - this.anchor[0]) * Math.PI) / 180) * 6378137 * D;
    const U =
      (Math.log(Math.tan(Math.PI / 4 + (w.lat * Math.PI) / 360)) -
        Math.log(Math.tan(Math.PI / 4 + (this.anchor[1] * Math.PI) / 360))) *
      6378137 *
      D;
    this.sun.target.position.set(F, U, 0);
    this.ground.position.set(F, U, 0.01);
    this.sun.position.copy(T.multiplyScalar(1800)).add(this.sun.target.position);
    this.sun.intensity = p.altitude > 0 ? 2.4 : 0;
    this.sun.castShadow = this.shadows && p.altitude > 0;
    this.sky.intensity = p.altitude > 0 ? 1.2 : 0.4;
    this.sun.color.set(p.altitude < 0.25 ? 16766371 : 16773852);
    this.sun.shadow.camera.left = -l;
    this.sun.shadow.camera.right = l;
    this.sun.shadow.camera.top = l;
    this.sun.shadow.camera.bottom = -l;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.renderer.shadowMap.needsUpdate = true;
    this.map?.triggerRepaint();
  }
  setShadows(enabled) {
    this.shadows = enabled;
    if (this.renderer) {
      this.renderer.shadowMap.enabled = enabled;
    }
    this.setSun(this.hour);
  }
  render(i, o) {
    const p = performance.now();
    if (!this.enabled || !this.localMatrix || this.map.getZoom() <= 15) {
      this.revealAnimation.lastTime = null;
      return;
    }
    const x = this.map.getCenter();
    const T = `${x.lng.toFixed(3)}/${x.lat.toFixed(3)}/${this.map.getZoom().toFixed(1)}`;
    if (!this.map.isMoving() && T !== this.shadowKey) {
      this.shadowKey = T;
      this.setSun(this.hour);
    }
    const w = this.frameMatrix
      .fromArray(o.defaultProjectionData.mainMatrix)
      .multiply(this.localMatrix);
    this.camera.projectionMatrix.fromArray(o.projectionMatrix);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.matrixWorldInverse.copy(this.camera.projectionMatrixInverse).multiply(w);
    this.camera.matrixWorld.copy(this.camera.matrixWorldInverse).invert();
    this.camera.matrix.copy(this.camera.matrixWorld);
    this.cameraPosition.setFromMatrixPosition(this.camera.matrixWorld);
    this.frustum.setFromProjectionMatrix(w);
    const l = `${x.lng.toFixed(5)}/${x.lat.toFixed(5)}/${this.map.getZoom().toFixed(2)}/${this.map.getBearing().toFixed(0)}/${this.map.getPitch().toFixed(0)}`;
    if (l !== this.lodKey) {
      this.lodKey = l;
      const se = [0, 0, 0];
      for (const Z of this.treeBatches) {
        const G = Math.max(1, this.cameraPosition.distanceTo(Z.sphere.center) - Z.sphere.radius);
        const re =
          ((Z.crown / G) *
            Math.abs(this.camera.projectionMatrix.elements[5]) *
            this.map.getCanvas().clientHeight) /
          2;
        const ue = this.visibility.vegetation && this.frustum.intersectsSphere(Z.sphere);
        const ce = this.treeDetail === 'full' ? 0 : TreeLod.level(G, re, Z.level);
        if (ce !== Z.level) {
          this.renderer.shadowMap.needsUpdate = true;
        }
        Z.level = ce;
        for (let pe = 0; pe < 3; pe++) {
          for (const de of Z.levels[pe]) {
            de.visible = this.visibility.vegetation && pe === ce;
          }
        }
        if (ue) {
          se[ce] += Z.count;
        }
      }
      this.map.getCanvas().dataset.treeLod = se.join('/');
      this.visibleTreeCount = se[0] + se[1] + se[2];
    }
    const D = this.traffic.update(
      this.cameraPosition,
      this.frustum,
      (Math.abs(this.camera.projectionMatrix.elements[5]) * this.map.getCanvas().clientHeight) / 2,
      this.visibility.roads && this.map.getZoom() >= 17,
      this.shadows,
      l,
    );
    const F = this.boats.update(this.cameraPosition, this.frustum, this.map.getZoom() > 15, l);
    const U = this.trains.update(this.cameraPosition, this.frustum, this.visibility.roads, l);
    this.windTime.value = this.wind ? (performance.now() - this.startTime) / 1000 : 0;
    this.waterMaterial.uniforms.waterTime.value = (performance.now() - this.startTime) / 1000;
    let j = false;
    for (const se of this.tiles.values()) {
      if (se.water && this.frustum.intersectsSphere(se.water)) {
        j = true;
        break;
      }
    }
    const q = this.revealAnimation.update(
      performance.now(),
      this.frustum,
      this.visibility,
      this.motion,
      `${l}/${this.motion}`,
      document.hidden,
    );
    const N = this.wind && this.visibility.vegetation && this.visibleTreeCount > 0;
    if (
      q ||
      this.lastMotion !== this.motion ||
      this.wasEntering !== q ||
      this.lastWind !== this.wind
    ) {
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.lastMotion = this.motion;
    this.wasEntering = q;
    this.lastWind = this.wind;
    this.mapDepthRange = i.getParameter(i.DEPTH_RANGE);
    this.renderer.resetState();
    this.renderer.setViewport(0, 0, i.drawingBufferWidth, i.drawingBufferHeight);
    if (this.renderer.shadowMap.needsUpdate) {
      this.shadowCount++;
    }
    this.shadowTriangles = 0;
    this.shadowDrawCalls = 0;
    const J = performance.now();
    if (
      (this.renderMetrics?.begin(),
      this.renderer.render(this.scene, this.camera),
      this.renderMetrics?.end(
        performance.now() - J,
        this.map.isMoving(),
        this.renderer.info.render.triangles - this.shadowTriangles,
        this.renderer.info.render.calls - this.shadowDrawCalls,
      ),
      this.renderer.resetState(),
      (this.map.getCanvas().dataset.sceneTriangles =
        this.renderer.info.render.triangles - this.shadowTriangles),
      (this.lastRenderCpuMs = performance.now() - p),
      (this.map.getCanvas().dataset.sceneDrawCalls =
        this.renderer.info.render.calls - this.shadowDrawCalls),
      (this.map.getCanvas().dataset.shadowTriangles = this.shadowTriangles),
      (this.map.getCanvas().dataset.sceneCpuMs = (performance.now() - J).toFixed(2)),
      (this.map.getCanvas().dataset.sceneFrames = ++this.frameCount),
      (this.map.getCanvas().dataset.shadowUpdates = this.shadowCount),
      !this.trafficReportAt || performance.now() - this.trafficReportAt > 500)
    ) {
      this.trafficReportAt = performance.now();
      this.map.getCanvas().dataset.trafficCars = this.traffic.group.visible
        ? this.traffic.count
        : 0;
      this.map.getCanvas().dataset.trafficDrawCalls = this.traffic.group.visible
        ? this.traffic.meshes.filter((Z) => Z.count > 0).length +
          (this.shadows && this.traffic.count > 0 ? 1 : 0)
        : 0;
      this.map.getCanvas().dataset.trafficClock = this.traffic.clock.toFixed(3);
      this.map.getCanvas().dataset.trafficCpuMs = (this.traffic.lastCpuMs || 0).toFixed(3);
      this.map.getCanvas().dataset.lampCount = this.lampBatches.reduce(
        (Z, G) =>
          Z +
          (G.visible && this.frustum.intersectsSphere(G.userData.worldSphere || G.boundingSphere)
            ? G.count
            : 0),
        0,
      );
      this.map.getCanvas().dataset.boatCount = this.boats.group.visible ? this.boats.count : 0;
      this.map.getCanvas().dataset.boatRoutes = this.boats.routes.length;
      this.map.getCanvas().dataset.trainCars = this.trains.count;
      this.map.getCanvas().dataset.trainRoutes = this.trains.routes.length;
      this.map.getCanvas().dataset.trainDrawCalls = this.trains.group.visible
        ? this.trains.meshes.filter((Z) => Z.count > 0).length
        : 0;
      this.map.getCanvas().dataset.trainCpuMs = (this.trains.lastCpuMs || 0).toFixed(3);
      this.map.getCanvas().dataset.trainTriangles = this.trains.group.visible
        ? this.trains.meshes.reduce((Z, G) => Z + (G.count * G.geometry.index.count) / 3, 0)
        : 0;
      const se = {};
      for (const Z of this.tiles.values()) {
        for (const [G, re] of Object.entries(Z.data.detailStats)) {
          se[G] = (se[G] || 0) + re;
        }
      }
      this.map.getCanvas().dataset.osmDetails = JSON.stringify(se);
    }
    this.map.getCanvas().dataset.revealState = `${this.revealAnimation.pending.length}/${this.revealAnimation.active.length}/${this.revealAnimation.started}`;
    this.map.getCanvas().dataset.revealTime = this.sceneAge.value.toFixed(3);
    if ((q || N || D || F || U || j) && !this.repaintTimer) {
      this.repaintTimer = setTimeout(
        () => {
          this.repaintTimer = null;
          if (!document.hidden) {
            this.map.triggerRepaint();
          }
        },
        D || U ? 33 : 40,
      );
    }
  }
  pick(point) {
    if (!this.visibility.buildings || !this.enabled || this.map.getZoom() <= 15) {
      return null;
    }
    const o = this.map.getCanvas();
    const p = (point.x / o.clientWidth) * 2 - 1;
    const x = 1 - (point.y / o.clientHeight) * 2;
    const T = new Vector3(p, x, -1).unproject(this.camera);
    const w = new Vector3(p, x, 1).unproject(this.camera);
    this.raycaster.set(T, w.sub(T).normalize());
    const l = [...this.tiles.values()].map((j) => j.buildings).filter(Boolean);
    const D = this.raycaster.intersectObjects(l)[0];
    if (!D) {
      return null;
    }
    const F = D.object.geometry;
    const U = F.attributes.revealDelay.getX(
      F.index ? F.index.getX(D.faceIndex * 3) : D.faceIndex * 3,
    );
    return this.motion && this.sceneAge.value - U < 1.5
      ? null
      : D.object.userData.features.find(
          (j) => D.faceIndex >= j.startTriangle && D.faceIndex < j.startTriangle + j.triangleCount,
        );
  }
  onRemove() {
    clearTimeout(this.repaintTimer);
    this.clear();
    this.sun?.shadow.map?.dispose();
    this.treeLod.dispose();
    this.traffic?.dispose();
    this.boats?.dispose();
    this.trains?.dispose();
    this.lampTemplate?.dispose();
    for (const i of this.furnitureTemplates.values()) {
      i.dispose();
    }
    this.waterMaterial?.dispose();
    this.renderer?.dispose();
  }
}
export { MapScene };

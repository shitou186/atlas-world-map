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
    this.root.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
      object.customDepthMaterial?.dispose();
      object.dispose?.();
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
    const tile = this.tiles.get(key);
    if (!tile) {
      return;
    }
    const animations = new Set(tile.animations);
    const trees = new Set(tile.trees);
    const lamps = new Set(tile.lamps);
    for (const listName of ['entries', 'pending', 'active']) {
      this.revealAnimation[listName] = this.revealAnimation[listName].filter(
        (entry) => !animations.has(entry),
      );
    }
    this.treeBatches = this.treeBatches.filter((batch) => !trees.has(batch));
    this.lampBatches = this.lampBatches.filter((batch) => !lamps.has(batch));
    tile.group.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
      object.customDepthMaterial?.dispose();
      object.dispose?.();
    });
    this.root.remove(tile.group);
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
        const trafficRoutes = new Map();
        const boatRoutes = new Map();
        const railways = [];
        for (const tile of this.tiles.values()) {
          for (const route of tile.routes) {
            if (!trafficRoutes.has(route.id)) {
              trafficRoutes.set(route.id, route);
            }
          }
          for (const route of tile.boats) {
            if (!boatRoutes.has(route.id)) {
              boatRoutes.set(route.id, route);
            }
          }
          railways.push(...tile.railways);
        }
        this.traffic.setData([...trafficRoutes.values()]);
        this.boats.setData([...boatRoutes.values()]);
        this.trains.setData(railways);
        this.map.triggerRepaint();
      }, 250);
    }
  }
  animateMesh(mesh, vegetation = false) {
    const material = mesh.material;
    const vertexTransform = `
      float elapsed = max(0.0, sceneAge - revealDelay);
      float growth = elapsed >= 1.5 ? 1.0 : clamp(1.0 - exp(-5.8 * elapsed) * (cos(9.0 * elapsed) + 0.64 * sin(9.0 * elapsed)), 0.0, 1.08);
      growth = mix(1.0, growth, revealEnabled);
      transformed.z *= growth;
      ${vegetation ? 'transformed.xy *= mix(0.65, 1.0, growth); transformed.x += sin(windTime * 1.3 + position.z * 0.7 + revealDelay * 12.0) * position.z * position.z * 0.0018 * growth;' : ''}
    `;
    const depthMaterial = new MeshDepthMaterial({
      depthPacking: RGBADepthPacking,
      side: mesh.material.side,
      map: mesh.material.map,
      alphaTest: mesh.material.alphaTest,
    });
    mesh.customDepthMaterial = depthMaterial;
    for (const animatedMaterial of [mesh.material, depthMaterial]) {
      animatedMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.sceneAge = this.sceneAge;
        shader.uniforms.windTime = this.windTime;
        shader.uniforms.revealEnabled = this.revealAnimation.enabled;
        shader.vertexShader =
          `uniform float sceneAge; uniform float windTime; uniform float revealEnabled; attribute float revealDelay;
` +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
` + vertexTransform,
          );
        if (mesh.geometry.hasAttribute('surfaceMaterial') && animatedMaterial === material) {
          shader.vertexShader =
            `attribute vec3 surfaceMaterial; varying vec3 vSurfaceMaterial;
` +
            shader.vertexShader.replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
vSurfaceMaterial = surfaceMaterial;`,
            );
          shader.fragmentShader =
            `varying vec3 vSurfaceMaterial;
` +
            shader.fragmentShader
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
      animatedMaterial.customProgramCacheKey = () =>
        vegetation
          ? 'tree-motion-v2'
          : mesh.geometry.hasAttribute('surfaceMaterial')
            ? 'building-material-v3'
            : 'building-motion-v2';
    }
    this.shadowMesh(mesh);
  }
  shadowMesh(mesh) {
    // 阴影贴图要求标准深度范围；绘制完成后恢复地图当前的深度范围。
    mesh.onBeforeShadow = () => this.gl.depthRange(0, 1);
    mesh.onAfterShadow = () => {
      this.gl.depthRange(this.mapDepthRange[0], this.mapDepthRange[1]);
      this.shadowTriangles = this.renderer.info.render.triangles;
      this.shadowDrawCalls = this.renderer.info.render.calls;
    };
  }
  reveal(id, pointX, pointY) {
    let seed = 0;
    for (const idCharacter of id) {
      seed = (Math.imul(seed, 31) + idCharacter.charCodeAt(0)) | 0;
    }
    return Math.min(0.75, Math.hypot(pointX, pointY) / 1300) + ((seed >>> 0) % 200) / 1000;
  }
  replay() {
    this.revealAnimation.replay();
    this.map.triggerRepaint();
  }
  setVisible(kind, visible) {
    this.visibility[kind] = visible;
    this.root.traverse((object) => {
      if (object.userData.kind === kind && object.userData.lod === void 0) {
        object.visible = visible;
      }
    });
    this.lodKey = '';
    this.revealAnimation.viewKey = '';
    this.renderer.shadowMap.needsUpdate = true;
    this.map.triggerRepaint();
  }
  *prepareTile(key, data) {
    const startedAt = performance.now();
    if (!this.localMatrix) {
      this.anchor = data.anchor;
    }
    const anchor = this.anchor;
    // 将各瓦片的局部米制坐标换算到场景锚点，兼顾纬度比例与经度跨界。
    const tileScale =
      Math.cos((anchor[1] * Math.PI) / 180) / Math.cos((data.anchor[1] * Math.PI) / 180);
    const offsetX =
      (((((data.anchor[0] - anchor[0] + 540) % 360) - 180) * Math.PI) / 180) *
      6378137 *
      Math.cos((anchor[1] * Math.PI) / 180);
    const offsetY =
      (Math.log(Math.tan(Math.PI / 4 + (data.anchor[1] * Math.PI) / 360)) -
        Math.log(Math.tan(Math.PI / 4 + (anchor[1] * Math.PI) / 360))) *
      6378137 *
      Math.cos((anchor[1] * Math.PI) / 180);
    const tileGroup = new Group();
    tileGroup.position.set(offsetX, offsetY, 0);
    tileGroup.scale.set(tileScale, tileScale, 1);
    tileGroup.updateMatrix();
    const tile = {
      group: tileGroup,
      data: data,
      buildings: null,
      trees: [],
      lamps: [],
      animations: [],
      routes: [],
      boats: [],
      railways: [],
    };
    this.tiles.set(key, tile);
    this.root.add(tileGroup);
    // 地图使用墨卡托坐标：水平轴换算并翻转 Y，海拔使用独立的米制比例。
    const mercatorAnchor = maplibregl.MercatorCoordinate.fromLngLat(anchor);
    const altitudeScale = mercatorAnchor.meterInMercatorCoordinateUnits();
    const horizontalScale = 1 / (2 * Math.PI * 6378137 * Math.cos((anchor[1] * Math.PI) / 180));
    if (
      ((this.localMatrix = new Matrix4()
        .makeTranslation(mercatorAnchor.x, mercatorAnchor.y, 0)
        .scale(new Vector3(horizontalScale, -horizontalScale, altitudeScale))),
      data.positions.length)
    ) {
      const buildingGeometry = new BufferGeometry();
      buildingGeometry.setAttribute('position', new BufferAttribute(data.positions, 3));
      buildingGeometry.setAttribute('color', new BufferAttribute(data.colors, 3));
      buildingGeometry.setAttribute('surfaceMaterial', new BufferAttribute(data.materials, 3));
      buildingGeometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
      buildingGeometry.setIndex(new BufferAttribute(data.indices, 1));
      buildingGeometry.computeBoundingBox();
      buildingGeometry.computeBoundingSphere();
      const revealTimes = new Float32Array(data.positions.length / 3);
      const revealAttribute = new BufferAttribute(revealTimes, 1).setUsage(DynamicDrawUsage);
      for (const feature of data.features) {
        const vertexOffset = feature.startVertex * 3;
        const revealDelay = this.reveal(
          feature.id,
          data.positions[vertexOffset],
          data.positions[vertexOffset + 1],
        );
        const bounds = feature.bounds;
        const sphere = new Sphere(
          new Vector3(
            (bounds[0] + bounds[3]) / 2,
            (bounds[1] + bounds[4]) / 2,
            (bounds[2] + bounds[5]) / 2,
          ),
          (Math.hypot(bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]) / 2) *
            1.08,
        );
        sphere.applyMatrix4(tileGroup.matrix);
        tile.animations.push(
          this.revealAnimation.add(
            feature.id,
            'buildings',
            sphere,
            revealAttribute,
            feature.startVertex,
            feature.vertexCount,
            revealDelay,
          ),
        );
      }
      buildingGeometry.setAttribute('revealDelay', revealAttribute);
      const buildingMaterial = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.87,
        metalness: 0,
        side: DoubleSide,
      });
      tile.buildings = new Mesh(buildingGeometry, buildingMaterial);
      tile.buildings.castShadow = true;
      tile.buildings.receiveShadow = true;
      tile.buildings.userData = {
        kind: 'buildings',
        features: data.features,
      };
      tile.buildings.visible = this.visibility.buildings;
      this.animateMesh(tile.buildings);
      tileGroup.add(tile.buildings);
      yield;
    }
    for (const [surfaceKind, surfaceData] of Object.entries(data.surfaces || {})) {
      if (!surfaceData.positions.length) {
        continue;
      }
      const surfaceGeometry = new BufferGeometry();
      surfaceGeometry.setAttribute('position', new BufferAttribute(surfaceData.positions, 3));
      surfaceGeometry.setAttribute('color', new BufferAttribute(surfaceData.colors, 3));
      surfaceGeometry.setAttribute('normal', new BufferAttribute(surfaceData.normals, 3));
      surfaceGeometry.setIndex(new BufferAttribute(surfaceData.indices, 1));
      const isStructure = ['structures', 'fenceMesh'].includes(surfaceKind);
      const renderOrder =
        surfaceKind === 'grass'
          ? 1
          : surfaceKind === 'markings' || surfaceKind === 'sportLines'
            ? 4
            : 3;
      const surfaceMaterial = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.94,
        side: DoubleSide,
        polygonOffset: !isStructure,
        polygonOffsetFactor: 0,
        polygonOffsetUnits: -renderOrder,
      });
      surfaceMaterial.onBeforeCompile = (shader) => {
        shader.vertexShader =
          `varying vec3 surfacePoint;
` +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
surfacePoint = ` +
              (surfaceKind === 'fenceMesh'
                ? 'vec3(dot(position.xy, vec2(-normal.y, normal.x)), 0.0, position.z);'
                : 'position;'),
          );
        const surfaceFragment =
          surfaceKind === 'paving' || surfaceKind === 'curb'
            ? 'vec2 tile = abs(fract(surfacePoint.xy * vec2(1.7, 3.4)) - 0.5); float seam = smoothstep(0.46, 0.49, max(tile.x, tile.y)); diffuseColor.rgb *= 1.0 - seam * 0.16;'
            : surfaceKind === 'fenceMesh'
              ? 'vec2 grid = vec2(surfacePoint.x + surfacePoint.z, surfacePoint.x - surfacePoint.z) * 10.0; vec2 distance = abs(fract(grid + 0.5) - 0.5); vec2 aa = max(fwidth(grid), vec2(0.001)); float wire = 1.0 - smoothstep(0.025, 0.025 + min(aa.x, aa.y), min(distance.x, distance.y)); if (wire < 0.45) discard;'
              : ['markings', 'structures', 'sport', 'sportLines'].includes(surfaceKind)
                ? ''
                : 'vec2 grainPoint = surfacePoint.xy * 65.0; float grain = fract(sin(dot(floor(grainPoint), vec2(12.9898,78.233))) * 43758.5453); float detailFade = 1.0 - smoothstep(0.25, 1.0, max(fwidth(grainPoint.x), fwidth(grainPoint.y))); diffuseColor.rgb *= 1.0 + (grain - 0.5) * 0.09 * detailFade;';
        shader.fragmentShader =
          `varying vec3 surfacePoint;
` +
          shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
` + surfaceFragment,
          );
      };
      surfaceMaterial.customProgramCacheKey = () => `surface-${surfaceKind}`;
      const surfaceMesh = new Mesh(surfaceGeometry, surfaceMaterial);
      surfaceMesh.castShadow = surfaceKind === 'structures';
      if (surfaceMesh.castShadow) {
        this.shadowMesh(surfaceMesh);
      }
      surfaceMesh.renderOrder = isStructure ? 0 : renderOrder;
      surfaceMesh.receiveShadow = true;
      surfaceMesh.userData.kind = surfaceKind === 'grass' ? 'vegetation' : 'roads';
      surfaceMesh.visible = this.visibility[surfaceMesh.userData.kind];
      tileGroup.add(surfaceMesh);
      yield;
    }
    if (data.sleepers.length) {
      const sleeperGeometry = new BoxGeometry(1, 0.21, 0.1);
      const sleeperMaterial = new MeshLambertMaterial({
        color: '#817b6c',
      });
      const sleeperMesh = new InstancedMesh(
        sleeperGeometry,
        sleeperMaterial,
        data.sleepers.length / 4,
      );
      const sleeperTransform = new Object3D();
      for (let sleeperIndex = 0; sleeperIndex < sleeperMesh.count; sleeperIndex++) {
        const sleeperOffset = sleeperIndex * 4;
        sleeperTransform.position.set(
          data.sleepers[sleeperOffset],
          data.sleepers[sleeperOffset + 1],
          0.13,
        );
        sleeperTransform.rotation.z = data.sleepers[sleeperOffset + 2];
        sleeperTransform.scale.x = data.sleepers[sleeperOffset + 3];
        sleeperTransform.updateMatrix();
        sleeperMesh.setMatrixAt(sleeperIndex, sleeperTransform.matrix);
        if (sleeperIndex % 512 === 511) {
          yield;
        }
      }
      sleeperMesh.computeBoundingSphere();
      sleeperMesh.receiveShadow = true;
      sleeperMesh.userData.kind = 'roads';
      sleeperMesh.visible = this.visibility.roads;
      tileGroup.add(sleeperMesh);
      yield;
    }
    // 按树种和空间网格分批实例化，三个 LOD 共享每棵树的展示时间属性。
    const treesByCell = new Map();
    for (const tree of data.trees || []) {
      const cellKey = `${tree.variant}/${Math.floor(tree.x / 160)}/${Math.floor(tree.y / 160)}`;
      if (!treesByCell.has(cellKey)) {
        treesByCell.set(cellKey, []);
      }
      treesByCell.get(cellKey).push(tree);
    }
    for (const trees of treesByCell.values()) {
      const species = trees[0].variant;
      const template = this.treeLod.create(species, this.renderer, this.gl);
      const treeTransform = new Object3D();
      const revealAttribute = new InstancedBufferAttribute(
        new Float32Array(trees.length),
        1,
      ).setUsage(DynamicDrawUsage);
      for (let treeIndex = 0; treeIndex < trees.length; treeIndex++) {
        const tree = trees[treeIndex];
        const sphere = new Sphere(
          new Vector3(tree.x, tree.y, tree.height / 2),
          Math.hypot(tree.crown / 2, tree.height / 2) * 1.1,
        );
        sphere.applyMatrix4(tileGroup.matrix);
        tile.animations.push(
          this.revealAnimation.add(
            tree.id,
            'vegetation',
            sphere,
            revealAttribute,
            treeIndex,
            1,
            this.reveal(tree.id, sphere.center.x, sphere.center.y),
          ),
        );
      }
      const batch = {
        levels: [[], [], []],
        level: -1,
        sphere: null,
        crown: 0,
        count: trees.length,
      };
      for (const tree of trees) {
        batch.crown = Math.max(batch.crown, tree.crown);
      }
      for (let levelIndex = 0; levelIndex < 3; levelIndex++) {
        for (const [partName, partGeometry] of Object.entries(template.levels[levelIndex])) {
          const geometry = new BufferGeometry();
          for (const [attributeName, attribute] of Object.entries(partGeometry.attributes)) {
            geometry.setAttribute(attributeName, attribute);
          }
          if (partGeometry.index) {
            geometry.setIndex(partGeometry.index);
          }
          geometry.boundingSphere = partGeometry.boundingSphere.clone();
          geometry.setAttribute('revealDelay', revealAttribute);
          const material =
            levelIndex === 2
              ? new MeshBasicMaterial({
                  map: template.atlas.texture,
                  alphaTest: 0.28,
                  side: FrontSide,
                })
              : new MeshLambertMaterial({
                  vertexColors: true,
                  side: DoubleSide,
                });
          const mesh = new InstancedMesh(geometry, material, trees.length);
          for (let treeIndex = 0; treeIndex < trees.length; treeIndex++) {
            const tree = trees[treeIndex];
            treeTransform.position.set(tree.x, tree.y, 0.04);
            treeTransform.rotation.set(0, 0, tree.angle);
            treeTransform.scale.set(tree.crown / 6.2, tree.crown / 6.2, tree.height / 10);
            treeTransform.updateMatrix();
            mesh.setMatrixAt(treeIndex, treeTransform.matrix);
          }
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.computeBoundingSphere();
          mesh.boundingSphere.radius += 3;
          mesh.userData = {
            kind: 'vegetation',
            lod: levelIndex,
          };
          mesh.visible = false;
          this.animateMesh(mesh, true);
          tileGroup.add(mesh);
          batch.levels[levelIndex].push(mesh);
          if (batch.sphere) {
            batch.sphere.union(mesh.boundingSphere);
          } else {
            batch.sphere = mesh.boundingSphere.clone();
          }
        }
      }
      batch.sphere.applyMatrix4(tileGroup.matrix);
      this.treeBatches.push(batch);
      tile.trees.push(batch);
      yield;
    }
    const lampsByCell = new Map();
    for (const lamp of data.lamps || []) {
      const cellKey = `${Math.floor(lamp.x / 240)}/${Math.floor(lamp.y / 240)}`;
      if (!lampsByCell.has(cellKey)) {
        lampsByCell.set(cellKey, []);
      }
      lampsByCell.get(cellKey).push(lamp);
    }
    if (lampsByCell.size) {
      this.lampTemplate ||= ModelAssets.geometry('lamp');
    }
    for (const lamps of lampsByCell.values()) {
      const geometry = new BufferGeometry();
      for (const [attributeName, attribute] of Object.entries(this.lampTemplate.attributes)) {
        geometry.setAttribute(attributeName, attribute);
      }
      geometry.boundingSphere = this.lampTemplate.boundingSphere.clone();
      const revealAttribute = new InstancedBufferAttribute(
        new Float32Array(lamps.length),
        1,
      ).setUsage(DynamicDrawUsage);
      geometry.setAttribute('revealDelay', revealAttribute);
      const material = new MeshLambertMaterial({
        vertexColors: true,
      });
      const mesh = new InstancedMesh(geometry, material, lamps.length);
      const lampTransform = new Object3D();
      for (let lampIndex = 0; lampIndex < lamps.length; lampIndex++) {
        const lamp = lamps[lampIndex];
        lampTransform.position.set(lamp.x, lamp.y, lamp.z);
        lampTransform.rotation.set(0, 0, lamp.angle);
        lampTransform.scale.set(1, 1, lamp.height / 8);
        lampTransform.updateMatrix();
        mesh.setMatrixAt(lampIndex, lampTransform.matrix);
        const sphere = new Sphere(
          new Vector3(lamp.x, lamp.y, lamp.z + lamp.height / 2),
          Math.hypot(2.6, lamp.height / 2) * 1.1,
        );
        sphere.applyMatrix4(tileGroup.matrix);
        tile.animations.push(
          this.revealAnimation.add(
            lamp.id,
            'lamps',
            sphere,
            revealAttribute,
            lampIndex,
            1,
            this.reveal(lamp.id, sphere.center.x, sphere.center.y),
          ),
        );
      }
      mesh.computeBoundingSphere();
      mesh.boundingSphere.radius += 1;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.kind = 'lamps';
      mesh.visible = this.visibility.lamps;
      mesh.userData.worldSphere = mesh.boundingSphere.clone().applyMatrix4(tileGroup.matrix);
      this.animateMesh(mesh);
      tileGroup.add(mesh);
      this.lampBatches.push(mesh);
      tile.lamps.push(mesh);
      yield;
    }
    const furnitureByCell = new Map();
    for (const furniture of data.furniture) {
      const cellKey = `${furniture.kind}/${Math.floor(furniture.x / 120)}/${Math.floor(furniture.y / 120)}`;
      if (!furnitureByCell.has(cellKey)) {
        furnitureByCell.set(cellKey, []);
      }
      furnitureByCell.get(cellKey).push(furniture);
    }
    for (const furnitureItems of furnitureByCell.values()) {
      const kind = furnitureItems[0].kind;
      if (!this.furnitureTemplates.has(kind)) {
        this.furnitureTemplates.set(kind, ModelAssets.geometry(kind));
      }
      const template = this.furnitureTemplates.get(kind);
      const geometry = new BufferGeometry();
      for (const [attributeName, attribute] of Object.entries(template.attributes)) {
        geometry.setAttribute(attributeName, attribute);
      }
      geometry.boundingSphere = template.boundingSphere.clone();
      const revealAttribute = new InstancedBufferAttribute(
        new Float32Array(furnitureItems.length),
        1,
      ).setUsage(DynamicDrawUsage);
      geometry.setAttribute('revealDelay', revealAttribute);
      const mesh = new InstancedMesh(
        geometry,
        new MeshLambertMaterial({
          vertexColors: true,
          side: DoubleSide,
        }),
        furnitureItems.length,
      );
      const furnitureTransform = new Object3D();
      for (let furnitureIndex = 0; furnitureIndex < furnitureItems.length; furnitureIndex++) {
        const furniture = furnitureItems[furnitureIndex];
        furnitureTransform.position.set(furniture.x, furniture.y, furniture.z);
        furnitureTransform.rotation.set(0, 0, furniture.angle);
        furnitureTransform.updateMatrix();
        mesh.setMatrixAt(furnitureIndex, furnitureTransform.matrix);
        const sphere = template.boundingSphere
          .clone()
          .applyMatrix4(furnitureTransform.matrix)
          .applyMatrix4(tileGroup.matrix);
        sphere.radius *= 1.08;
        tile.animations.push(
          this.revealAnimation.add(
            furniture.id,
            'roads',
            sphere,
            revealAttribute,
            furnitureIndex,
            1,
            this.reveal(furniture.id, sphere.center.x, sphere.center.y),
          ),
        );
      }
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.kind = 'roads';
      mesh.visible = this.visibility.roads;
      this.animateMesh(mesh);
      tileGroup.add(mesh);
      yield;
    }
    for (this.lodKey = ''; this.seen.size > 150000;) {
      this.seen.delete(this.seen.values().next().value);
    }
    if (data.water.length) {
      const waterGeometry = new BufferGeometry();
      waterGeometry.setAttribute('position', new BufferAttribute(data.water, 3));
      waterGeometry.setAttribute('normal', new BufferAttribute(data.waterNormals, 3));
      waterGeometry.setIndex(new BufferAttribute(data.waterIndices, 1));
      const waterMaterial = this.waterMaterial.create();
      const waterMesh = new Mesh(waterGeometry, waterMaterial);
      waterMesh.renderOrder = 2;
      waterGeometry.computeBoundingSphere();
      tile.water = waterGeometry.boundingSphere.clone().applyMatrix4(tileGroup.matrix);
      waterMesh.receiveShadow = true;
      tileGroup.add(waterMesh);
    }
    // 路线位置、累计距离和包围盒同步变换，保证运动采样与裁剪使用同一坐标系。
    for (const routeKind of ['traffic', 'boats']) {
      for (const route of data[routeKind] || []) {
        const points = route.points.slice();
        for (let pointOffset = 0; pointOffset < points.length; pointOffset += 3) {
          points[pointOffset] = points[pointOffset] * tileScale + offsetX;
          points[pointOffset + 1] = points[pointOffset + 1] * tileScale + offsetY;
        }
        const bounds = route.bounds;
        const transformedRoute = {
          ...route,
          points: points,
          distances: route.distances.map((distance) => distance * tileScale),
          length: route.length * tileScale,
          bounds: [
            bounds[0] * tileScale + offsetX,
            bounds[1] * tileScale + offsetY,
            bounds[2] * tileScale + offsetX,
            bounds[3] * tileScale + offsetY,
          ],
        };
        tile[routeKind === 'traffic' ? 'routes' : 'boats'].push(transformedRoute);
      }
    }
    for (const railway of data.railways) {
      const points = railway.points.slice();
      for (let pointOffset = 0; pointOffset < points.length; pointOffset += 3) {
        points[pointOffset] = points[pointOffset] * tileScale + offsetX;
        points[pointOffset + 1] = points[pointOffset + 1] * tileScale + offsetY;
      }
      tile.railways.push({
        ...railway,
        points: points,
      });
    }
    this.updateRoutes();
    this.revealAnimation.viewKey = '';
    this.setSun(this.hour);
    this.map.triggerRepaint();
    this.metrics?.record('sceneCommit', {
      duration: performance.now() - startedAt,
      moving: this.map.isMoving(),
    });
  }
  setSun(hour) {
    if (((this.hour = hour), !this.sun)) {
      return;
    }
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setTime(date.getTime() + (hour - this.anchor[0] / 15) * 3600000);
    const sunPosition = SunCalc.getPosition(date, this.anchor[1], this.anchor[0]);
    const altitude = Math.max(0.02, sunPosition.altitude);
    const sunDirection = new Vector3(
      -Math.sin(sunPosition.azimuth) * Math.cos(altitude),
      -Math.cos(sunPosition.azimuth) * Math.cos(altitude),
      Math.sin(altitude),
    );
    this.waterMaterial.uniforms.waterSun.value.copy(sunDirection);
    const mapCenter = this.map.getCenter();
    const shadowExtent = Math.min(1300, Math.max(180, 750 * 2 ** (17 - this.map.getZoom())));
    const latitudeCos = Math.cos((this.anchor[1] * Math.PI) / 180);
    const centerX = (((mapCenter.lng - this.anchor[0]) * Math.PI) / 180) * 6378137 * latitudeCos;
    const centerY =
      (Math.log(Math.tan(Math.PI / 4 + (mapCenter.lat * Math.PI) / 360)) -
        Math.log(Math.tan(Math.PI / 4 + (this.anchor[1] * Math.PI) / 360))) *
      6378137 *
      latitudeCos;
    this.sun.target.position.set(centerX, centerY, 0);
    this.ground.position.set(centerX, centerY, 0.01);
    this.sun.position.copy(sunDirection.multiplyScalar(1800)).add(this.sun.target.position);
    this.sun.intensity = sunPosition.altitude > 0 ? 2.4 : 0;
    this.sun.castShadow = this.shadows && sunPosition.altitude > 0;
    this.sky.intensity = sunPosition.altitude > 0 ? 1.2 : 0.4;
    this.sun.color.set(sunPosition.altitude < 0.25 ? 16766371 : 16773852);
    this.sun.shadow.camera.left = -shadowExtent;
    this.sun.shadow.camera.right = shadowExtent;
    this.sun.shadow.camera.top = shadowExtent;
    this.sun.shadow.camera.bottom = -shadowExtent;
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
  render(gl, renderArgs) {
    const startedAt = performance.now();
    if (!this.enabled || !this.localMatrix || this.map.getZoom() <= 15) {
      this.revealAnimation.lastTime = null;
      return;
    }
    const mapCenter = this.map.getCenter();
    const shadowKey = `${mapCenter.lng.toFixed(3)}/${mapCenter.lat.toFixed(3)}/${this.map.getZoom().toFixed(1)}`;
    if (!this.map.isMoving() && shadowKey !== this.shadowKey) {
      this.shadowKey = shadowKey;
      this.setSun(this.hour);
    }
    // 拆解地图提供的投影与组合矩阵，恢复 Three.js 相机及局部场景视锥。
    const clipMatrix = this.frameMatrix
      .fromArray(renderArgs.defaultProjectionData.mainMatrix)
      .multiply(this.localMatrix);
    this.camera.projectionMatrix.fromArray(renderArgs.projectionMatrix);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.matrixWorldInverse.copy(this.camera.projectionMatrixInverse).multiply(clipMatrix);
    this.camera.matrixWorld.copy(this.camera.matrixWorldInverse).invert();
    this.camera.matrix.copy(this.camera.matrixWorld);
    this.cameraPosition.setFromMatrixPosition(this.camera.matrixWorld);
    this.frustum.setFromProjectionMatrix(clipMatrix);
    const viewKey = `${mapCenter.lng.toFixed(5)}/${mapCenter.lat.toFixed(5)}/${this.map.getZoom().toFixed(2)}/${this.map.getBearing().toFixed(0)}/${this.map.getPitch().toFixed(0)}`;
    // 视图变化后按距离和投影像素选择树木层级，并仅统计视锥内的实例。
    if (viewKey !== this.lodKey) {
      this.lodKey = viewKey;
      const lodCounts = [0, 0, 0];
      for (const batch of this.treeBatches) {
        const distance = Math.max(
          1,
          this.cameraPosition.distanceTo(batch.sphere.center) - batch.sphere.radius,
        );
        const projectedPixels =
          ((batch.crown / distance) *
            Math.abs(this.camera.projectionMatrix.elements[5]) *
            this.map.getCanvas().clientHeight) /
          2;
        const inView = this.visibility.vegetation && this.frustum.intersectsSphere(batch.sphere);
        const level =
          this.treeDetail === 'full' ? 0 : TreeLod.level(distance, projectedPixels, batch.level);
        if (level !== batch.level) {
          this.renderer.shadowMap.needsUpdate = true;
        }
        batch.level = level;
        for (let levelIndex = 0; levelIndex < 3; levelIndex++) {
          for (const mesh of batch.levels[levelIndex]) {
            mesh.visible = this.visibility.vegetation && levelIndex === level;
          }
        }
        if (inView) {
          lodCounts[level] += batch.count;
        }
      }
      this.map.getCanvas().dataset.treeLod = lodCounts.join('/');
      this.visibleTreeCount = lodCounts[0] + lodCounts[1] + lodCounts[2];
    }
    const trafficMoving = this.traffic.update(
      this.cameraPosition,
      this.frustum,
      (Math.abs(this.camera.projectionMatrix.elements[5]) * this.map.getCanvas().clientHeight) / 2,
      this.visibility.roads && this.map.getZoom() >= 17,
      this.shadows,
      viewKey,
    );
    const boatsMoving = this.boats.update(
      this.cameraPosition,
      this.frustum,
      this.map.getZoom() > 15,
      viewKey,
    );
    const trainsMoving = this.trains.update(
      this.cameraPosition,
      this.frustum,
      this.visibility.roads,
      viewKey,
    );
    this.windTime.value = this.wind ? (performance.now() - this.startTime) / 1000 : 0;
    this.waterMaterial.uniforms.waterTime.value = (performance.now() - this.startTime) / 1000;
    let waterVisible = false;
    for (const tile of this.tiles.values()) {
      if (tile.water && this.frustum.intersectsSphere(tile.water)) {
        waterVisible = true;
        break;
      }
    }
    const revealMoving = this.revealAnimation.update(
      performance.now(),
      this.frustum,
      this.visibility,
      this.motion,
      `${viewKey}/${this.motion}`,
      document.hidden,
    );
    const windMoving = this.wind && this.visibility.vegetation && this.visibleTreeCount > 0;
    if (
      revealMoving ||
      this.lastMotion !== this.motion ||
      this.wasEntering !== revealMoving ||
      this.lastWind !== this.wind
    ) {
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.lastMotion = this.motion;
    this.wasEntering = revealMoving;
    this.lastWind = this.wind;
    // 地图和 Three.js 共用上下文；阴影绘制临时使用标准深度范围，再恢复地图设置。
    this.mapDepthRange = gl.getParameter(gl.DEPTH_RANGE);
    this.renderer.resetState();
    this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    if (this.renderer.shadowMap.needsUpdate) {
      this.shadowCount++;
    }
    this.shadowTriangles = 0;
    this.shadowDrawCalls = 0;
    const renderStartedAt = performance.now();
    if (
      (this.renderMetrics?.begin(),
      this.renderer.render(this.scene, this.camera),
      this.renderMetrics?.end(
        performance.now() - renderStartedAt,
        this.map.isMoving(),
        this.renderer.info.render.triangles - this.shadowTriangles,
        this.renderer.info.render.calls - this.shadowDrawCalls,
      ),
      this.renderer.resetState(),
      (this.map.getCanvas().dataset.sceneTriangles =
        this.renderer.info.render.triangles - this.shadowTriangles),
      (this.lastRenderCpuMs = performance.now() - startedAt),
      (this.map.getCanvas().dataset.sceneDrawCalls =
        this.renderer.info.render.calls - this.shadowDrawCalls),
      (this.map.getCanvas().dataset.shadowTriangles = this.shadowTriangles),
      (this.map.getCanvas().dataset.sceneCpuMs = (performance.now() - renderStartedAt).toFixed(2)),
      (this.map.getCanvas().dataset.sceneFrames = ++this.frameCount),
      (this.map.getCanvas().dataset.shadowUpdates = this.shadowCount),
      !this.trafficReportAt || performance.now() - this.trafficReportAt > 500)
    ) {
      this.trafficReportAt = performance.now();
      this.map.getCanvas().dataset.trafficCars = this.traffic.group.visible
        ? this.traffic.count
        : 0;
      this.map.getCanvas().dataset.trafficDrawCalls = this.traffic.group.visible
        ? this.traffic.meshes.filter((mesh) => mesh.count > 0).length +
          (this.shadows && this.traffic.count > 0 ? 1 : 0)
        : 0;
      this.map.getCanvas().dataset.trafficClock = this.traffic.clock.toFixed(3);
      this.map.getCanvas().dataset.trafficCpuMs = (this.traffic.lastCpuMs || 0).toFixed(3);
      this.map.getCanvas().dataset.lampCount = this.lampBatches.reduce(
        (count, mesh) =>
          count +
          (mesh.visible &&
          this.frustum.intersectsSphere(mesh.userData.worldSphere || mesh.boundingSphere)
            ? mesh.count
            : 0),
        0,
      );
      this.map.getCanvas().dataset.boatCount = this.boats.group.visible ? this.boats.count : 0;
      this.map.getCanvas().dataset.boatRoutes = this.boats.routes.length;
      this.map.getCanvas().dataset.trainCars = this.trains.count;
      this.map.getCanvas().dataset.trainRoutes = this.trains.routes.length;
      this.map.getCanvas().dataset.trainDrawCalls = this.trains.group.visible
        ? this.trains.meshes.filter((mesh) => mesh.count > 0).length
        : 0;
      this.map.getCanvas().dataset.trainCpuMs = (this.trains.lastCpuMs || 0).toFixed(3);
      this.map.getCanvas().dataset.trainTriangles = this.trains.group.visible
        ? this.trains.meshes.reduce(
            (triangles, mesh) => triangles + (mesh.count * mesh.geometry.index.count) / 3,
            0,
          )
        : 0;
      const detailStats = {};
      for (const tile of this.tiles.values()) {
        for (const [kind, count] of Object.entries(tile.data.detailStats)) {
          detailStats[kind] = (detailStats[kind] || 0) + count;
        }
      }
      this.map.getCanvas().dataset.osmDetails = JSON.stringify(detailStats);
    }
    this.map.getCanvas().dataset.revealState = `${this.revealAnimation.pending.length}/${this.revealAnimation.active.length}/${this.revealAnimation.started}`;
    this.map.getCanvas().dataset.revealTime = this.sceneAge.value.toFixed(3);
    // 仅当展示、风、水面或交通仍需运动时安排下一帧，页面隐藏时停止重绘。
    if (
      (revealMoving ||
        windMoving ||
        trafficMoving ||
        boatsMoving ||
        trainsMoving ||
        waterVisible) &&
      !this.repaintTimer
    ) {
      this.repaintTimer = setTimeout(
        () => {
          this.repaintTimer = null;
          if (!document.hidden) {
            this.map.triggerRepaint();
          }
        },
        trafficMoving || trainsMoving ? 33 : 40,
      );
    }
  }
  pick(point) {
    if (!this.visibility.buildings || !this.enabled || this.map.getZoom() <= 15) {
      return null;
    }
    const canvas = this.map.getCanvas();
    const normalizedX = (point.x / canvas.clientWidth) * 2 - 1;
    const normalizedY = 1 - (point.y / canvas.clientHeight) * 2;
    const nearPoint = new Vector3(normalizedX, normalizedY, -1).unproject(this.camera);
    const farPoint = new Vector3(normalizedX, normalizedY, 1).unproject(this.camera);
    this.raycaster.set(nearPoint, farPoint.sub(nearPoint).normalize());
    const buildings = [...this.tiles.values()].map((tile) => tile.buildings).filter(Boolean);
    const intersection = this.raycaster.intersectObjects(buildings)[0];
    if (!intersection) {
      return null;
    }
    const geometry = intersection.object.geometry;
    const revealTime = geometry.attributes.revealDelay.getX(
      geometry.index ? geometry.index.getX(intersection.faceIndex * 3) : intersection.faceIndex * 3,
    );
    return this.motion && this.sceneAge.value - revealTime < 1.5
      ? null
      : intersection.object.userData.features.find(
          (feature) =>
            intersection.faceIndex >= feature.startTriangle &&
            intersection.faceIndex < feature.startTriangle + feature.triangleCount,
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
    for (const geometry of this.furnitureTemplates.values()) {
      geometry.dispose();
    }
    this.waterMaterial?.dispose();
    this.renderer?.dispose();
  }
}
export { MapScene };

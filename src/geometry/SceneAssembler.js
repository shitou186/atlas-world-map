// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { BuildingGeometry } from './BuildingGeometry.js';
import { VectorTileDecoder } from './VectorTileDecoder.js';
import { LandscapeGeometry } from './LandscapeGeometry.js';
import { BoatRoutes } from '../routes/BoatRoutes.js';
import { TileClipping } from './TileClipping.js';
import { MeshPacking } from './MeshPacking.js';
class SceneAssembler {
  static VERSION = 3;
  constructor({ maxLandcoverTiles: A = 16, maxLandcoverVertices: C = 100000 } = {}) {
    this.ready = BuildingGeometry.init();
    this.landcover = new Map();
    this.landcoverVertices = 0;
    this.maxLandcoverTiles = A;
    this.maxLandcoverVertices = C;
  }
  vegetation(A, C, Q, i, E, s, w) {
    const t = `${SceneAssembler.VERSION}/${E || `${i}/${C}/${Q}`}`;
    let y = this.landcover.get(t);
    const Y = !!y;
    if (y) {
      this.landcover.delete(t);
    } else {
      const G = VectorTileDecoder.bounds(C, Q, i);
      const J = new BuildingGeometry([(G.west + G.east) / 2, (G.south + G.north) / 2]);
      y = {
        projection: J,
        records: [],
        vertices: 0,
      };
      for (const S of VectorTileDecoder.vegetation(A, C, Q, i)) {
        const U = J.project(S.geometry);
        for (const j of U) {
          for (const n of j) {
            y.vertices += n.length;
          }
        }
        y.records.push({
          feature: S,
          polygons: U,
        });
      }
      this.landcoverVertices += y.vertices;
    }
    for (
      this.landcover.set(t, y);
      this.landcover.size > this.maxLandcoverTiles ||
      this.landcoverVertices > this.maxLandcoverVertices;
    ) {
      const G = this.landcover.keys().next().value;
      this.landcoverVertices -= this.landcover.get(G).vertices;
      this.landcover.delete(G);
    }
    const N = w.scale / y.projection.scale;
    const a = (y.projection.originX - w.originX) * w.scale;
    const K = (y.projection.originY - w.originY) * w.scale;
    const e = [];
    for (const G of y.records) {
      const J = G.feature.bbox;
      if (J[2] < s.west || J[0] > s.east || J[3] < s.south || J[1] > s.north) {
        continue;
      }
      const S = [];
      for (const U of G.polygons) {
        const j = [];
        for (const n of U) {
          const F = [];
          for (const q of n) {
            F.push([q[0] * N + a, q[1] * N + K]);
          }
          j.push(F);
        }
        S.push(j);
      }
      e.push({
        ...G.feature,
        projectedPolygons: S,
      });
    }
    return {
      features: e,
      hit: Y,
    };
  }
  async build({
    x: A,
    y: C,
    bytes: Q,
    greenBytes: i,
    greenX: E,
    greenY: s,
    greenZ: w,
    greenKey: t,
  }) {
    const y = performance.now();
    await this.ready;
    const Y = performance.now();
    const N = VectorTileDecoder.decode(Q, A, C);
    const a = VectorTileDecoder.bounds(A, C);
    const K = [(a.west + a.east) / 2, (a.south + a.north) / 2];
    const e = new LandscapeGeometry(K, a);
    const G = i ? this.vegetation(i, E, s, w, t, a, e.projection) : null;
    if (G) {
      N.push(...G.features);
    }
    const J = performance.now();
    const S = new BuildingGeometry(K).build(N);
    const U = performance.now();
    Object.assign(S, e.build(N));
    S.boats = BoatRoutes.build(N, e);
    const j = performance.now();
    S.anchor = K;
    S.bounds = a;
    S.source = 'OpenStreetMap · Streets GL · OpenFreeMap';
    S.geometryVersion = SceneAssembler.VERSION;
    S.landcoverSource = t || null;
    const n = TileClipping.clip(S, a);
    MeshPacking.pack(n);
    n.timings = {
      init: Y - y,
      decode: J - Y,
      buildings: U - J,
      landscape: j - U,
      pack: performance.now() - j,
      total: performance.now() - y,
      landcoverCacheHit: G?.hit || false,
    };
    return n;
  }
}
export { SceneAssembler };

// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import ClipperLib from 'clipper-lib';
import { PolygonGrid } from './PolygonGrid.js';
class SurfaceTopology {
  constructor(A, C) {
    const [Q, i, E, s] = A;
    this.tile = [
      [
        [
          [Q, i],
          [E, i],
          [E, s],
          [Q, s],
          [Q, i],
        ],
      ],
    ];
    this.landscape = C;
    this.records = [];
    this.sources = {};
    this.roadMarkings = [];
    this.stats = {
      surfaces: 0,
      candidates: 0,
      differences: 0,
      hidden: 0,
      unresolvedLevels: 0,
    };
  }
  add(A, C, Q, i, E, s, w = 'area') {
    const t = E.properties || {};
    let y = t.min_height;
    if (typeof y == 'string') {
      const G = /^\s*(-?\d+(?:\.\d+)?)\s*(m|ft)?\s*$/.exec(y);
      y = G ? Number(G[1]) * (G[2] === 'ft' ? 0.3048 : 1) : void 0;
    }
    const Y = Number.isFinite(y) ? y : 0;
    const N =
      t.man_made === 'pier'
        ? 'pier'
        : t.location === 'roof'
          ? 'roof'
          : t.bridge && t.bridge !== 'no'
            ? 'bridge'
            : t.tunnel && t.tunnel !== 'no'
              ? 'tunnel'
              : 'ground';
    const a = `${N}/${t.layer || 0}/${t.level || 0}/${Y}`;
    let K = 0;
    for (const G of A) {
      for (let J = 0; J < G.length; J++) {
        const S = G[J];
        let U = 0;
        for (let j = 1; j < S.length; j++) {
          U += S[j - 1][0] * S[j][1] - S[j][0] * S[j - 1][1];
        }
        K += (Math.abs(U) / 2) * (J ? -1 : 1);
      }
    }
    const e = {
      polygons: A.length
        ? this.landscape.combine(A, this.tile, ClipperLib.ClipType.ctIntersection, 1000000)
        : [],
      kind: C,
      height: Q + Y,
      color: i,
      priority: s,
      plane: a,
      scope: w,
      area: K,
      key: `${C}/${i}/${E.id}`,
      markings: [],
    };
    this.records.push(e);
    (this.sources[C] ||= []).push({
      id: E.id,
      properties: {
        ...t,
      },
      plane: a,
    });
    if (
      (N !== 'ground' || (t.layer && t.layer !== '0') || (t.level && t.level !== '0')) &&
      !Number.isFinite(y)
    ) {
      this.stats.unresolvedLevels++;
    }
    return e;
  }
  build(A) {
    const C = new Map();
    const Q = new Map();
    this.records.sort(
      (E, s) => s.priority - E.priority || E.area - s.area || E.key.localeCompare(s.key),
    );
    for (const [E, s] of this.records.entries()) {
      s.rank = E;
      if (!C.has(s.plane)) {
        C.set(s.plane, []);
      }
      for (const w of s.polygons) {
        C.get(s.plane).push(w);
        Q.set(w, s);
      }
    }
    for (const [E, s] of C) {
      C.set(E, new PolygonGrid(s, 64));
    }
    const i = new PolygonGrid(this.roadMarkings, 64);
    for (const E of this.records) {
      if (!E.polygons.length) {
        continue;
      }
      this.stats.surfaces++;
      const s = new Set();
      for (const y of E.polygons) {
        for (const Y of C.get(E.plane).query(y[0])) {
          const N = Q.get(Y);
          if (!(
            N.rank >= E.rank ||
            (E.scope === 'area' && N.scope !== 'area') ||
            (E.scope === 'linear' && N.scope === 'area' && (N.priority < 40 || N.kind === 'water'))
          )) {
            s.add(Y);
          }
        }
      }
      this.stats.candidates += s.size;
      let w = E.polygons;
      if (
        (s.size &&
          ((w = A.combine(w, [...s], ClipperLib.ClipType.ctDifference, 1000000)),
          this.stats.differences++),
        !w.length)
      ) {
        this.stats.hidden++;
        continue;
      }
      let t = E.markings;
      if (E.scope === 'linear' && E.kind === 'asphalt') {
        const y = new Set();
        for (const Y of w) {
          for (const N of i.query(Y[0])) {
            y.add(N);
          }
        }
        t = [...y];
      }
      if (t.length) {
        const y = A.combine(t, w, ClipperLib.ClipType.ctIntersection, 1000000);
        if (y.length) {
          w = A.combine(w, y, ClipperLib.ClipType.ctDifference, 1000000);
          A.surface(y, E.scope === 'linear' ? 'markingGround' : 'sportLines', E.height, '#eee9db');
        }
      }
      A.surface(w, E.kind, E.height, E.color);
    }
    return {
      surfaceSources: this.sources,
      surfaceTopologyStats: this.stats,
    };
  }
}
export { SurfaceTopology };

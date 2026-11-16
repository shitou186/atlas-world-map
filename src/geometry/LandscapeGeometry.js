// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { BuildingGeometry } from './BuildingGeometry.js';
import { SurfaceTopology } from './SurfaceTopology.js';
import { TileClipping } from './TileClipping.js';
import ClipperLib from 'clipper-lib';
import { Color } from 'three';
import earcut, { flatten } from 'earcut';
import { StreetFurniture } from './StreetFurniture.js';
import { RoadMarkings } from './RoadMarkings.js';
import { TrafficRoutes } from '../routes/TrafficRoutes.js';
class LandscapeGeometry {
  constructor(anchor, bounds) {
    this.projection = new BuildingGeometry(anchor);
    this.anchor = anchor;
    this.bounds = bounds;
    this.buffers = {};
    this.blockers = new Map();
    this.trees = [];
    this.treeCells = new Map();
    this.roads = [];
    this.stats = {
      roads: 0,
      inferredWidths: 0,
      mappedTrees: 0,
      generatedTrees: 0,
      crossings: 0,
      lamps: 0,
    };
    this.lamps = [];
    this.markings = {
      polygons: [],
      crossings: [],
    };
    this.topology = new SurfaceTopology(TileClipping.rectangle(anchor, bounds), this);
  }
  point(coordinate) {
    let C = coordinate[0];
    for (; C - this.anchor[0] > 180;) {
      C -= 360;
    }
    for (; C - this.anchor[0] < -180;) {
      C += 360;
    }
    return [
      (((C * Math.PI) / 180) * 6378137 - this.projection.originX) * this.projection.scale,
      (Math.log(Math.tan(Math.PI / 4 + (coordinate[1] * Math.PI) / 360)) * 6378137 -
        this.projection.originY) *
        this.projection.scale,
    ];
  }
  random(A) {
    let C = Math.imul(A ^ 2654435769, 2246822507);
    C = Math.imul(C ^ (C >>> 13), 3266489909);
    return ((C ^ (C >>> 16)) >>> 0) / 4294967296;
  }
  combine(A, C = null, Q = ClipperLib.ClipType.ctDifference, i = 1000) {
    const E = new ClipperLib.Clipper();
    for (const [t, y] of [
      [A, ClipperLib.PolyType.ptSubject],
      [C, ClipperLib.PolyType.ptClip],
    ]) {
      if (t) {
        for (const Y of t) {
          for (let N = 0; N < Y.length; N++) {
            const a = Y[N].map((K) => ({
              X: Math.round(K[0] * i),
              Y: Math.round(K[1] * i),
            }));
            if (ClipperLib.Clipper.Orientation(a) !== (N === 0)) {
              a.reverse();
            }
            E.AddPath(a, y, true);
          }
        }
      }
    }
    const s = new ClipperLib.PolyTree();
    E.Execute(
      C ? Q : ClipperLib.ClipType.ctUnion,
      s,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero,
    );
    const w = [];
    for (const t of ClipperLib.JS.PolyTreeToExPolygons(s)) {
      const y = [];
      for (const Y of [t.outer, ...t.holes]) {
        const N = Y.map((a) => [a.X / i, a.Y / i]);
        N.push(N[0]);
        y.push(N);
      }
      w.push(y);
    }
    return w;
  }
  ribbon(A, C) {
    const Q = [];
    const i = [];
    for (let s = 0; s < A.length; s++) {
      const w = A[s];
      const t = A[Math.max(0, s - 1)];
      const y = A[Math.min(A.length - 1, s + 1)];
      const Y = Math.hypot(w[0] - t[0], w[1] - t[1]);
      const N = Math.hypot(y[0] - w[0], y[1] - w[1]);
      const a = Y ? -(w[1] - t[1]) / Y : -(y[1] - w[1]) / N;
      const K = Y ? (w[0] - t[0]) / Y : (y[0] - w[0]) / N;
      const e = N ? -(y[1] - w[1]) / N : a;
      const G = N ? (y[0] - w[0]) / N : K;
      const J = Math.max(0.25, 1 + a * e + K * G);
      const S = (((a + e) / J) * C) / 2;
      const U = (((K + G) / J) * C) / 2;
      Q.push([w[0] + S, w[1] + U]);
      i.push([w[0] - S, w[1] - U]);
    }
    const E = [...Q, ...i.reverse()];
    E.push(E[0]);
    return [E];
  }
  surface(A, C, Q, i, E = 0) {
    if (C === 'markings' || C === 'crossings') {
      this.markings[C === 'crossings' ? 'crossings' : 'polygons'].push(...A);
      return;
    }
    const s = (this.buffers[C] ||= {
      positions: [],
      colors: [],
    });
    const w = new Color(i).toArray();
    for (const t of A) {
      const y = flatten(t);
      const Y = earcut(y.vertices, y.holes, 2);
      for (const N of Y) {
        s.positions.push(y.vertices[N * 2], y.vertices[N * 2 + 1], Q);
        s.colors.push(...w);
      }
      if (E) {
        for (const N of t) {
          for (let a = 1; a < N.length; a++) {
            const K = N[a - 1];
            const e = N[a];
            s.positions.push(...K, Q, ...e, Q, ...e, Q - E, ...K, Q, ...e, Q - E, ...K, Q - E);
            for (let G = 0; G < 6; G++) {
              s.colors.push(w[0] * 0.83, w[1] * 0.83, w[2] * 0.83);
            }
          }
        }
      }
    }
  }
  contains(A, C) {
    let Q = false;
    for (const i of C) {
      for (let E = 0, s = i.length - 1; E < i.length; s = E++) {
        const w = i[E];
        const t = i[s];
        if (
          w[1] > A[1] != t[1] > A[1] &&
          A[0] < ((t[0] - w[0]) * (A[1] - w[1])) / (t[1] - w[1]) + w[0]
        ) {
          Q = !Q;
        }
      }
    }
    return Q;
  }
  block(A) {
    const C = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
    for (const E of A[0]) {
      C[0] = Math.min(C[0], E[0]);
      C[1] = Math.min(C[1], E[1]);
      C[2] = Math.max(C[2], E[0]);
      C[3] = Math.max(C[3], E[1]);
    }
    const Q = this.point([this.bounds.west, this.bounds.south]);
    const i = this.point([this.bounds.east, this.bounds.north]);
    for (
      let E = Math.floor(Math.max(Q[0], C[0]) / 40);
      E <= Math.floor(Math.min(i[0], C[2]) / 40);
      E++
    ) {
      for (
        let s = Math.floor(Math.max(Q[1], C[1]) / 40);
        s <= Math.floor(Math.min(i[1], C[3]) / 40);
        s++
      ) {
        const w = `${E}/${s}`;
        if (!this.blockers.has(w)) {
          this.blockers.set(w, []);
        }
        this.blockers.get(w).push(A);
      }
    }
  }
  tree(A, C, Q, i) {
    const E = this.point([this.bounds.west, this.bounds.south]);
    const s = this.point([this.bounds.east, this.bounds.north]);
    if (A[0] < E[0] || A[0] > s[0] || A[1] < E[1] || A[1] > s[1]) {
      return;
    }
    const w = Math.floor(A[0] / 4);
    const t = Math.floor(A[1] / 4);
    if (i !== 'node') {
      for (const J of this.blockers.get(`${Math.floor(A[0] / 40)}/${Math.floor(A[1] / 40)}`) ||
        []) {
        if (this.contains(A, J)) {
          return;
        }
      }
      for (let J = w - 1; J <= w + 1; J++) {
        for (let S = t - 1; S <= t + 1; S++) {
          for (const U of this.treeCells.get(`${J}/${S}`) || []) {
            if (Math.hypot(U[0] - A[0], U[1] - A[1]) < 4) {
              return;
            }
          }
        }
      }
    }
    let y = 0;
    for (const J of Q) {
      y = (Math.imul(y, 31) + J.charCodeAt(0)) | 0;
    }
    const Y = [C.height, C.diameter_crown];
    for (let J = 0; J < Y.length; J++) {
      if (typeof Y[J] == 'string') {
        const S = /^\s*(\d+(?:\.\d+)?)\s*(m|ft)?\s*$/.exec(Y[J]);
        Y[J] = S ? Number(S[1]) * (S[2] === 'ft' ? 0.3048 : 1) : void 0;
      }
    }
    const [N, a] = Y;
    const K =
      C.leaf_type === 'needleleaved' || /Pinus|Picea|Abies|松|杉/.test(C.genus || C.species || '');
    const e = Number.isFinite(N) && N > 0 ? N : 8 + this.random(y) * 7;
    this.trees.push({
      id: Q,
      x: A[0],
      y: A[1],
      height: e,
      crown: Number.isFinite(a) && a > 0 ? a : e * (K ? 0.46 : 0.62),
      variant: K ? 3 : Math.floor(this.random(y + 1) * 3),
      angle: this.random(y + 2) * Math.PI * 2,
      source: i,
      inferredHeight: !(Number.isFinite(N) && N > 0),
      inferredCrown: !(Number.isFinite(a) && a > 0),
    });
    const G = `${w}/${t}`;
    if (!this.treeCells.has(G)) {
      this.treeCells.set(G, []);
    }
    this.treeCells.get(G).push(A);
    this.stats[i === 'node' ? 'mappedTrees' : 'generatedTrees']++;
  }
  build(features) {
    const C = new Map();
    const Q = [];
    const i = [];
    const E = [];
    const s = [];
    for (const n of features) {
      const F = n.properties;
      const q = n.geometry;
      if (q.type === 'Point') {
        if (F.highway === 'street_lamp') {
          const gA = this.point(q.coordinates);
          const EA = F.height;
          const iA = F.direction;
          this.lamps.push({
            id: n.id,
            x: gA[0],
            y: gA[1],
            z: 0.08,
            height: EA > 0 ? EA : 8,
            angle: Number.isFinite(iA) ? Math.PI / 2 - (iA * Math.PI) / 180 : null,
            inferredHeight: !(EA > 0),
          });
          this.stats.lamps++;
        }
        if (F.natural === 'tree') {
          this.tree(this.point(q.coordinates), F, n.id, 'node');
        }
        if (
          F.highway === 'crossing' &&
          F.crossing !== 'unmarked' &&
          F['crossing:markings'] !== 'no'
        ) {
          E.push(this.point(q.coordinates));
        }
        continue;
      }
      if (
        (F.natural === 'tree_row' && q.type === 'LineString' && i.push(n),
        F.footway === 'crossing' &&
          q.type === 'LineString' &&
          F['crossing:markings'] !== 'no' &&
          F.crossing !== 'unmarked' &&
          s.push(q.coordinates.map((gA) => this.point(gA))),
        ['Polygon', 'MultiPolygon'].includes(q.type))
      ) {
        const gA = n.projectedPolygons || this.projection.project(q);
        if (
          F.building ||
          F['building:part'] ||
          F.natural === 'water' ||
          F.waterway === 'riverbank'
        ) {
          for (const EA of gA) {
            this.block(EA);
          }
        }
        if (
          ((F.natural === 'water' || F.waterway === 'riverbank') &&
            this.topology.add(gA, 'water', 0.03, '#90a0b7', n, 90),
          ['wood', 'scrub', 'grassland', 'heath'].includes(F.natural) ||
            [
              'forest',
              'grass',
              'meadow',
              'village_green',
              'orchard',
              'vineyard',
              'flowerbed',
            ].includes(F.landuse) ||
            ['park', 'garden'].includes(F.leisure))
        ) {
          const EA =
            F.natural === 'wood' ||
            F.landuse === 'forest' ||
            F.landuse === 'orchard' ||
            F.leisure === 'park';
          Q.push({
            polygons: gA,
            tags: F,
            id: n.id,
            forest: EA,
          });
          this.topology.add(gA, 'grass', 0.025, '#a2b169', n, 10);
        }
        if ((F.highway && F.area === 'yes') || F.amenity === 'parking' || F.man_made === 'pier') {
          const EA = F.amenity === 'parking' || F.surface === 'asphalt' || F.highway === 'service';
          this.topology.add(gA, EA ? 'asphalt' : 'paving', 0.07, EA ? '#858989' : '#c9c2b2', n, 60);
        }
      }
      if (
        !F.highway ||
        q.type !== 'LineString' ||
        ['proposed', 'construction', 'steps'].includes(F.highway) ||
        F.footway === 'crossing' ||
        F.tunnel === 'yes'
      ) {
        continue;
      }
      const u = [];
      for (const gA of q.coordinates) {
        const EA = this.point(gA);
        if (!u.length || Math.hypot(EA[0] - u.at(-1)[0], EA[1] - u.at(-1)[1]) > 0.001) {
          u.push([...EA, 0.07]);
        }
      }
      if (u.length < 2) {
        continue;
      }
      const x = ['footway', 'path', 'pedestrian', 'cycleway', 'track'].includes(F.highway);
      const b = F.lanes || (F['lanes:forward'] || 0) + (F['lanes:backward'] || 0);
      const m = F.highway.replace('_link', '');
      const L = F.oneway === 'yes' || F.oneway === '-1';
      const p = ['motorway', 'trunk'].includes(m)
        ? 3.5
        : ['primary', 'secondary'].includes(m)
          ? 3.1
          : 2.8;
      const Z = {
        footway: 1.4,
        path: 1.2,
        pedestrian: 3,
        cycleway: 2,
        track: 2.5,
      };
      const V = {
        motorway: 7,
        trunk: 7,
        primary: 6.2,
        secondary: 6.2,
        tertiary: 5.6,
        residential: 5,
        service: 2.8,
        living_street: 4,
      };
      const z = F.width;
      const DA =
        z > 0 ? z : x ? Z[F.highway] : b ? b * p : L || F.highway.endsWith('_link') ? p : V[m] || 5;
      const yA = x ? 0 : b || Math.max(1, Math.round(DA / p));
      const QA = ['gravel', 'dirt', 'unpaved', 'ground', 'fine_gravel'].includes(F.surface)
        ? 'gravel'
        : ['paving_stones', 'sett', 'cobblestone'].includes(F.surface) ||
            (x && F.surface !== 'asphalt')
          ? 'paving'
          : 'asphalt';
      const sA = this.ribbon(u, DA);
      const _ = {
        id: n.id,
        tags: F,
        points: u,
        width: DA,
        lanes: yA,
        z: 0.07,
        path: x,
        kind: QA,
        polygon: sA,
        inferredWidth: !(z > 0),
        inferredLanes: !b,
      };
      this.roads.push(_);
      this.block(this.ribbon(u, DA + 2));
      this.stats.roads++;
      if (_.inferredWidth) {
        this.stats.inferredWidths++;
      }
    }
    const w = [];
    const t = [];
    for (const n of this.roads) {
      const { points: F, tags: q, path: u, width: x, kind: b } = n;
      if (
        (C.has(b) || C.set(b, []),
        C.get(b).push(n.polygon),
        w.push(n.polygon),
        !u && ['both', 'yes', 'left', 'right'].includes(q.sidewalk))
      ) {
        for (const m of q.sidewalk === 'left' ? [1] : q.sidewalk === 'right' ? [-1] : [1, -1]) {
          const L =
            q[m === 1 ? 'sidewalk:left:width' : 'sidewalk:right:width'] ||
            q['sidewalk:width'] ||
            1.5;
          const p = [];
          for (let Z = 0; Z < F.length; Z++) {
            const V = F[Math.max(0, Z - 1)];
            const z = F[Math.min(F.length - 1, Z + 1)];
            const DA = Math.hypot(z[0] - V[0], z[1] - V[1]);
            p.push([
              F[Z][0] - ((((z[1] - V[1]) / DA) * (x + L)) / 2) * m,
              F[Z][1] + ((((z[0] - V[0]) / DA) * (x + L)) / 2) * m,
            ]);
          }
          t.push(this.ribbon(p, L));
        }
      }
    }
    for (const n of this.roads) {
      const F = n.kind;
      this.topology.add(
        [n.polygon],
        F,
        n.z,
        F === 'asphalt' ? '#858989' : F === 'paving' ? '#c9c2b2' : '#aa9e83',
        {
          id: n.id,
          properties: n.tags,
        },
        F === 'asphalt' ? 3 : F === 'paving' ? 2 : 1,
        'linear',
      );
    }
    const y = t.length ? this.combine(t, w) : [];
    this.surface(y, 'curb', 0.23, '#d6d0c3', 0.16);
    for (const n of y) {
      this.block(n);
    }
    const Y = new StreetFurniture(this).build(features);
    const N = new RoadMarkings(this);
    N.build();
    const a = [];
    for (const n of s) {
      const F = n[0];
      const q = n.at(-1);
      const u = Math.hypot(q[0] - F[0], q[1] - F[1]);
      if (u < 1) {
        continue;
      }
      const x = (q[0] - F[0]) / u;
      const b = (q[1] - F[1]) / u;
      a.push([(F[0] + q[0]) / 2, (F[1] + q[1]) / 2]);
      for (let m = 0.25; m < u - 0.25; m += 0.9) {
        const L = F[0] + x * m;
        const p = F[1] + b * m;
        this.surface(
          [
            this.ribbon(
              [
                [L - b * 1.5, p + x * 1.5],
                [L + b * 1.5, p - x * 1.5],
              ],
              0.45,
            ),
          ],
          'crossings',
          0.07,
          '#f2efe4',
        );
      }
    }
    for (const n of E) {
      if (a.some((L) => Math.hypot(L[0] - n[0], L[1] - n[1]) < 4)) {
        continue;
      }
      let F = null;
      let q = 9;
      for (const L of this.roads) {
        if (!L.path) {
          for (let p = 0; p < L.points.length - 1; p++) {
            const Z = L.points[p];
            const V = L.points[p + 1];
            const z = V[0] - Z[0];
            const DA = V[1] - Z[1];
            const yA = Math.hypot(z, DA);
            const QA = Math.max(0, Math.min(1, ((n[0] - Z[0]) * z + (n[1] - Z[1]) * DA) / yA ** 2));
            const sA = [Z[0] + QA * z, Z[1] + QA * DA];
            const _ = Math.hypot(sA[0] - n[0], sA[1] - n[1]);
            if (_ < q) {
              q = _;
              F = {
                road: L,
                point: sA,
                dx: z / yA,
                dy: DA / yA,
              };
            }
          }
        }
      }
      if (!F) {
        continue;
      }
      const { road: u, point: x, dx: b, dy: m } = F;
      a.push(x);
      for (let L = -u.width / 2 + 0.6; L < u.width / 2 - 0.2; L += 1) {
        const p = [x[0] - m * L, x[1] + b * L];
        this.surface(
          [
            this.ribbon(
              [
                [p[0] - b * 1.7, p[1] - m * 1.7],
                [p[0] + b * 1.7, p[1] + m * 1.7],
              ],
              0.45,
            ),
          ],
          'crossings',
          u,
          '#f2efe4',
        );
      }
      this.stats.crossings++;
    }
    N.ground([...this.markings.polygons, ...this.markings.crossings], C.get('asphalt') || []);
    for (const n of i) {
      const F = n.geometry.coordinates.map((x) => this.point(x));
      let q = 0;
      let u = 0;
      for (let x = 0; x < F.length - 1; x++) {
        const b = F[x];
        const m = F[x + 1];
        const L = Math.hypot(m[0] - b[0], m[1] - b[1]);
        for (; q < L; q += 9) {
          this.tree(
            [b[0] + ((m[0] - b[0]) * q) / L, b[1] + ((m[1] - b[1]) * q) / L],
            n.properties,
            `${n.id}/${u++}`,
            'row',
          );
        }
        q -= L;
      }
    }
    const K = this.point([this.bounds.west, this.bounds.south]);
    const e = this.point([this.bounds.east, this.bounds.north]);
    const G = Math.cos((Math.round(this.anchor[1]) * Math.PI) / 180);
    const J = this.projection.scale / G;
    const S = [this.projection.originX * G, this.projection.originY * G];
    for (const n of Q) {
      if (n.forest) {
        for (const F of n.polygons) {
          const q = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
          for (const u of F[0]) {
            q[0] = Math.min(q[0], u[0]);
            q[1] = Math.min(q[1], u[1]);
            q[2] = Math.max(q[2], u[0]);
            q[3] = Math.max(q[3], u[1]);
          }
          for (
            let u = Math.floor((Math.max(K[0], q[0]) / J + S[0]) / 11);
            u <= Math.ceil((Math.min(e[0], q[2]) / J + S[0]) / 11);
            u++
          ) {
            for (
              let x = Math.floor((Math.max(K[1], q[1]) / J + S[1]) / 11);
              x <= Math.ceil((Math.min(e[1], q[3]) / J + S[1]) / 11);
              x++
            ) {
              const b = Math.imul(u, 73856093) ^ Math.imul(x, 19349663);
              const m = [
                (u * 11 + this.random(b) * 6 - S[0]) * J,
                (x * 11 + this.random(b + 1) * 6 - S[1]) * J,
              ];
              if (this.contains(m, F)) {
                this.tree(m, n.tags, `${n.id}/${u}/${x}`, 'area');
              }
            }
          }
        }
      }
    }
    for (const n of this.lamps) {
      let F = 30;
      for (const q of this.roads) {
        for (let u = 1; u < q.points.length; u++) {
          const x = q.points[u - 1];
          const b = q.points[u];
          const m = b[0] - x[0];
          const L = b[1] - x[1];
          const p = Math.max(
            0,
            Math.min(1, ((n.x - x[0]) * m + (n.y - x[1]) * L) / (m * m + L * L)),
          );
          const Z = x[0] + m * p - n.x;
          const V = x[1] + L * p - n.y;
          const z = Math.hypot(Z, V);
          if (!(z >= F)) {
            F = z;
            n.roadAngle = Math.atan2(V, Z);
            n.z = x[2] + (b[2] - x[2]) * p + 0.02;
          }
        }
      }
      n.angle ??= n.roadAngle ?? 0;
    }
    const U = this.topology.build(this);
    this.buffers.markings = this.buffers.markingGround || {
      positions: [],
      colors: [],
    };
    delete this.buffers.markingGround;
    const j = new Float32Array(this.buffers.water?.positions || []);
    delete this.buffers.water;
    this.buffers.grass ||= {
      positions: [],
      colors: [],
    };
    U.surfaceSources.water ||= [];
    U.surfaceSources.grass ||= [];
    for (const n of Object.values(this.buffers)) {
      n.positions = new Float32Array(n.positions);
      n.colors = new Float32Array(n.colors);
    }
    return {
      ...Y,
      ...U,
      surfaces: this.buffers,
      water: j,
      trees: this.trees,
      lamps: this.lamps,
      traffic: TrafficRoutes.build(this.roads),
      landscapeStats: this.stats,
      roadMetadata: this.roads.map((n) => ({
        id: n.id,
        width: n.width,
        lanes: n.lanes,
        inferredWidth: n.inferredWidth,
        inferredLanes: n.inferredLanes,
      })),
    };
  }
}
export { LandscapeGeometry };

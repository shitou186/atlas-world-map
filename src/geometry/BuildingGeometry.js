// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { Color } from 'three';
import earcut, { flatten } from 'earcut';
import { PolygonGrid } from './PolygonGrid.js';
import polygonClipping from 'polygon-clipping';
import { CoplanarClipping } from './CoplanarClipping.js';
const EARTH_RADIUS = 6378137;
const DEG_TO_RAD = Math.PI / 180;
let SkeletonBuilder;
class BuildingGeometry {
  static async init() {
    const skeleton = await import('straight-skeleton');
    SkeletonBuilder = skeleton.SkeletonBuilder || skeleton.default.SkeletonBuilder;
    await SkeletonBuilder.init();
  }
  constructor(anchor) {
    this.anchor = anchor;
    this.originX = EARTH_RADIUS * anchor[0] * DEG_TO_RAD;
    this.originY = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (anchor[1] * DEG_TO_RAD) / 2));
    this.scale = Math.cos(anchor[1] * DEG_TO_RAD);
  }
  project(geometry) {
    const C = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const Q = [];
    for (const i of C) {
      const E = [];
      for (let s = 0; s < i.length; s++) {
        const w = [];
        for (const t of i[s]) {
          let y = t[0];
          for (; y - this.anchor[0] > 180;) {
            y -= 360;
          }
          for (; y - this.anchor[0] < -180;) {
            y += 360;
          }
          const Y = (EARTH_RADIUS * y * DEG_TO_RAD - this.originX) * this.scale;
          const N =
            (EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (t[1] * DEG_TO_RAD) / 2)) -
              this.originY) *
            this.scale;
          if (!w.length || w.at(-1)[0] !== Y || w.at(-1)[1] !== N) {
            w.push([Y, N]);
          }
        }
        if (!(w.length < 3)) {
          if (w[0][0] !== w.at(-1)[0] || w[0][1] !== w.at(-1)[1]) {
            w.push([...w[0]]);
          }
          if (this.ringArea(w) > 0 != (s === 0)) {
            w.reverse();
          }
          E.push(w);
        }
      }
      if (E.length) {
        Q.push(E);
      }
    }
    return Q;
  }
  ringArea(ring) {
    let C = 0;
    for (let Q = 0; Q < ring.length - 1; Q++) {
      C += ring[Q][0] * ring[Q + 1][1] - ring[Q + 1][0] * ring[Q][1];
    }
    return C / 2;
  }
  tags(properties) {
    const C = {
      ...properties,
    };
    C['roof:shape'] ??= C['building:roof:shape'] ?? C['building:shape'];
    C['roof:material'] ??= C['building:roof:material'];
    C['building:material'] = C['building:facade:material'] ?? C['building:material'] ?? C.material;
    C['building:colour'] ??= C['building:color'] ?? C.colour ?? C.color;
    C['roof:colour'] ??= C['roof:color'] ?? C['building:roof:colour'] ?? C['building:roof:color'];
    for (const i of [
      'height',
      'min_height',
      'building:levels',
      'building:min_level',
      'roof:height',
      'roof:levels',
      'roof:angle',
      'roof:direction',
      'step:height',
    ]) {
      if (typeof C[i] != 'string') {
        continue;
      }
      const E = /^\s*(-?\d+(?:\.\d+)?)\s*(m|ft|°)?\s*$/.exec(C[i]);
      if (E) {
        C[i] = Number(E[1]) * (E[2] === 'ft' ? 0.3048 : 1);
      }
    }
    const Q = {
      N: 0,
      NNE: 22.5,
      NE: 45,
      ENE: 67.5,
      E: 90,
      ESE: 112.5,
      SE: 135,
      SSE: 157.5,
      S: 180,
      SSW: 202.5,
      SW: 225,
      WSW: 247.5,
      W: 270,
      WNW: 292.5,
      NW: 315,
      NNW: 337.5,
    };
    if (typeof C['roof:direction'] == 'string') {
      C['roof:direction'] = Q[C['roof:direction'].toUpperCase()];
    }
    for (const i of Object.keys(C)) {
      if (C[i] === void 0) {
        delete C[i];
      }
    }
    return C;
  }
  color(properties, roof) {
    const Q = {
      brick: '#ba8068',
      stone: '#d5c9ae',
      sandstone: '#d8b986',
      concrete: '#c4c3bc',
      plaster: '#e8dfca',
      wood: '#b49a73',
      glass: '#9bb8be',
      gold: '#ffd700',
      mirror: '#e7ebed',
      metal: '#a2aaa7',
      copper: '#78a390',
      slate: '#7e8587',
      roof_tiles: '#ae6c52',
      tile: '#ae6c52',
      tiles: '#ae6c52',
      thatch: '#bda574',
    };
    const i = roof ? properties['roof:colour'] : properties['building:colour'];
    const E = roof ? properties['roof:material'] : properties['building:material'];
    const s = roof ? '#f4f4f0' : '#e8e5da';
    const w =
      typeof i == 'string' &&
      (/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(i) || Object.hasOwn(Color.NAMES, i.toLowerCase()));
    const t =
      {
        glass: 0.3,
        gold: 0.2,
        mirror: 0.99,
      }[E] ?? 0.04;
    return {
      color: new Color(w ? i.toLowerCase() : Q[E] || s).toArray(),
      surface: [t, t > 0.04 ? 0.12 : 0.87, E === 'gold' || E === 'metal' || E === 'copper' ? 1 : 0],
    };
  }
  triangle(A, C, Q, i) {
    const E = C[0] - A[0];
    const s = C[1] - A[1];
    const w = C[2] - A[2];
    const t = Q[0] - A[0];
    const y = Q[1] - A[1];
    const Y = Q[2] - A[2];
    if (!(Math.hypot(s * Y - w * y, w * t - E * Y, E * y - s * t) < 1e-8)) {
      this.positions.push(...A, ...C, ...Q);
      this.colors.push(...i.color, ...i.color, ...i.color);
      this.materials.push(...i.surface, ...i.surface, ...i.surface);
    }
  }
  face(A, C, Q, i = false) {
    const E = flatten(A);
    const s = earcut(E.vertices, E.holes, 2);
    for (let w = 0; w < s.length; w += 3) {
      const t = [];
      for (let N = 0; N < 3; N++) {
        const a = s[w + N] * 2;
        const K = E.vertices[a];
        const e = E.vertices[a + 1];
        t.push([K, e, C(K, e)]);
      }
      const Y =
        (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) <
          0 !==
        i;
      this.triangle(t[0], t[Y ? 2 : 1], t[Y ? 1 : 2], Q);
    }
  }
  clipScalar(A, C, Q) {
    let i = A;
    for (const E of [1, -1]) {
      const s = E === 1 ? C : Q;
      const w = [];
      for (let t = 0; t < i.length; t++) {
        const y = i[t];
        const Y = i[(t + 1) % i.length];
        const N = (y[2] - s) * E;
        const a = (Y[2] - s) * E;
        if ((N >= 0 && w.push(y), (N < 0 && a > 0) || (N > 0 && a < 0))) {
          const K = N / (N - a);
          w.push([y[0] + (Y[0] - y[0]) * K, y[1] + (Y[1] - y[1]) * K, s]);
        }
      }
      i = w;
    }
    return i;
  }
  roofAxis(A, C) {
    let Q = 1 / 0;
    let i = 0;
    let E = [1, 0];
    for (let y = 0; y < A.length - 1; y++) {
      const Y = A[y + 1][0] - A[y][0];
      const N = A[y + 1][1] - A[y][1];
      const a = Math.hypot(Y, N);
      if (a < 1e-8) {
        continue;
      }
      const K = Y / a;
      const e = N / a;
      let G = 1 / 0;
      let J = -1 / 0;
      let S = 1 / 0;
      let U = -1 / 0;
      for (const n of A) {
        const F = n[0] * K + n[1] * e;
        const q = -n[0] * e + n[1] * K;
        G = Math.min(G, F);
        J = Math.max(J, F);
        S = Math.min(S, q);
        U = Math.max(U, q);
      }
      const j = (J - G) * (U - S);
      if (j < Q - 1e-7) {
        Q = j;
        i = Math.min(J - G, U - S);
        E = J - G >= U - S ? [-e, K] : [K, e];
      }
    }
    if (C['roof:orientation'] === 'across') {
      E = [-E[1], E[0]];
    }
    const s = C['roof:direction'];
    if (Number.isFinite(s)) {
      E = [Math.sin(s * DEG_TO_RAD), Math.cos(s * DEG_TO_RAD)];
    }
    let w = 1 / 0;
    let t = -1 / 0;
    for (const y of A) {
      const Y = y[0] * E[0] + y[1] * E[1];
      w = Math.min(w, Y);
      t = Math.max(t, Y);
    }
    return {
      x: E[0],
      y: E[1],
      min: w,
      max: t,
      width: i,
      middle: (w + t) / 2,
    };
  }
  mesh(polygons, properties, feature) {
    let E =
      {
        pyramid: 'pyramidal',
        pitched: 'gabled',
        saltbox: 'double_saltbox',
        triple_saltbox: 'quadruple_saltbox',
      }[properties['roof:shape']] ||
      properties['roof:shape'] ||
      'flat';
    const s = [];
    if (
      ![
        'flat',
        'hipped',
        'gabled',
        'skillion',
        'pyramidal',
        'gambrel',
        'mansard',
        'round',
        'dome',
        'onion',
        'double_saltbox',
        'quadruple_saltbox',
        'half-hipped',
        'sawtooth',
      ].includes(E)
    ) {
      this.warnings.push({
        id: feature.id,
        code: 'unsupported-roof',
        message: `\u5C4B\u9876\u5F62\u72B6 ${E} \u4F7F\u7528\u5E73\u9762\u8FD1\u4F3C`,
      });
      this.stats.unsupported++;
      E = 'flat';
      s.push('roof:shape');
    }
    const t = 0.35;
    const y = 0.75;
    if (E === 'gambrel' || E === 'mansard') {
      s.push('roof:break:position', 'roof:break:height');
      feature.roofProfile = {
        breakPosition: t,
        breakHeight: y,
        source: 'rule',
      };
    }
    if (E === 'double_saltbox' || E === 'quadruple_saltbox') {
      s.push('roof:break:position');
      feature.roofProfile = {
        breakPosition: 0.5,
        source: 'rule',
      };
    }
    if (E === 'half-hipped') {
      s.push('roof:hip:height');
      feature.roofProfile = {
        hipHeight: 0.55,
        source: 'rule',
      };
    }
    if (E === 'onion') {
      s.push('roof:bulge');
      feature.roofProfile = {
        bulge: 1.12,
        source: 'rule',
      };
    }
    let Y = properties.min_height;
    if (!Number.isFinite(Y)) {
      Y = properties['building:min_level'] * 3;
      if (Number.isFinite(Y)) {
        s.push('min_height');
      }
    }
    if (!Number.isFinite(Y)) {
      Y = 0;
    }
    let N = properties.height;
    const a = !Number.isFinite(N) && Number.isFinite(properties['building:levels']);
    if ((a && ((N = properties['building:levels'] * 3), s.push('height')), !Number.isFinite(N))) {
      let L = 2166136261;
      for (const p of feature.id) {
        L = Math.imul(L ^ p.charCodeAt(0), 16777619);
      }
      N = Y + 6 + ((L >>> 0) % 4) * 3;
      s.push('height');
    }
    const K = this.roofAxis(polygons[0][0], properties);
    let e = properties['roof:height'];
    if (
      (!Number.isFinite(e) &&
        E !== 'flat' &&
        ((e = properties['roof:levels'] * 3), Number.isFinite(e) && s.push('roof:height')),
      E === 'flat')
    ) {
      e = 0;
    } else if (!Number.isFinite(e)) {
      const L = properties['roof:angle'];
      if (Number.isFinite(L) && L > 0 && L < 90 && ['gabled', 'skillion', 'hipped'].includes(E)) {
        e = ((K.max - K.min) * Math.tan(L * DEG_TO_RAD)) / (E === 'skillion' ? 1 : 2);
      } else {
        if (['dome', 'mansard', 'gambrel', 'round'].includes(E)) {
          e = K.width / 2;
        } else {
          if (E === 'skillion') {
            e = (N * 0.25) / (a ? 0.75 : 1);
          } else {
            e = 4;
          }
        }
      }
      s.push('roof:height');
    }
    if (a) {
      N += e;
    }
    if (!properties['roof:shape']) {
      s.push('roof:shape');
    }
    if (N < Y) {
      if (Number.isFinite(properties.height)) {
        this.warnings.push({
          id: feature.id,
          code: 'invalid-height',
          message: '起始高度超过总高度，保留总高度并修正起始高度',
        });
        Y = Math.min(0, N);
        s.push('min_height');
      } else {
        this.warnings.push({
          id: feature.id,
          code: 'invalid-height',
          message: '楼层推算高度低于建筑底部，保留起始高度并修正推算高度',
        });
        N = Y + Math.max(3, e);
      }
    }
    if (e < 0 || e > N - Y) {
      this.warnings.push({
        id: feature.id,
        code: 'invalid-roof-height',
        message: '屋顶高度超出建筑范围，按总高度与起始高度修正',
      });
      e = Math.max(0, Math.min(e, N - Y));
      s.push('roof:height');
    }
    const G = new Map();
    const J = properties['roof:orientation'] || Number.isFinite(properties['roof:direction']);
    let S =
      ['hipped', 'mansard', 'quadruple_saltbox'].includes(E) ||
      (!J && ['gabled', 'gambrel', 'double_saltbox'].includes(E));
    if (['pyramidal', 'pyramid', 'dome', 'onion'].includes(E)) {
      for (const L of polygons) {
        let p = L.length === 1;
        const Z = L[0];
        for (let V = 0; V < Z.length - 1; V++) {
          const z = Z[V];
          const DA = Z[(V + 1) % (Z.length - 1)];
          const yA = Z[(V + 2) % (Z.length - 1)];
          if ((DA[0] - z[0]) * (yA[1] - DA[1]) - (DA[1] - z[1]) * (yA[0] - DA[0]) < -1e-7) {
            p = false;
          }
        }
        if (!p) {
          S = true;
          s.push('roof:geometry');
          break;
        }
      }
    }
    if (S) {
      for (const L of polygons) {
        const p = SkeletonBuilder.buildFromPolygon(L);
        if (!p || !p.polygons.length) {
          this.warnings.push({
            id: feature.id,
            code: 'skeleton-failed',
            message: '屋顶直骨架无法求解，使用平面近似',
          });
          E = 'flat';
          s.push('roof:shape');
          G.clear();
          break;
        }
        if (((p.wallFaces = new Set()), ['gabled', 'gambrel', 'double_saltbox'].includes(E))) {
          const Z = new Map();
          let V = false;
          for (const z of p.polygons) {
            if (z.length !== 3) {
              continue;
            }
            const DA = [];
            const yA = [];
            for (const _ of z) {
              (p.vertices[_][2] < 0.000001 ? DA : yA).push(_);
            }
            if (DA.length !== 2 || yA.length !== 1) {
              continue;
            }
            if (Z.has(yA[0])) {
              V = true;
              break;
            }
            const QA = p.vertices[DA[0]];
            const sA = p.vertices[DA[1]];
            Z.set(yA[0], [(QA[0] + sA[0]) / 2, (QA[1] + sA[1]) / 2]);
            p.wallFaces.add(z);
          }
          if (V || !Z.size) {
            continue;
          }
          for (const [z, DA] of Z) {
            p.vertices[z][0] = DA[0];
            p.vertices[z][1] = DA[1];
          }
        }
        G.set(L, p);
      }
    }
    if (E === 'flat') {
      e = 0;
    }
    const U = N - e;
    const j = this.color(properties, false);
    const n = this.color(properties, true);
    const F = properties.building !== 'roof' && properties.wall !== 'no';
    const q =
      E === 'skillion' &&
      (properties['building:part'] === 'steps' || properties.building === 'steps');
    const u = properties['step:height'] > 0 ? properties['step:height'] : 0.16;
    if (q && !properties['step:height']) {
      s.push('step:height');
    }
    const x = properties.man_made === 'chimney' || properties['tower:type'] === 'cooling';
    if (x) {
      s.push('building:profile');
      feature.buildingProfile = {
        waistHeight: 0.65,
        waistRadius: 0.55,
        source: 'rule',
      };
    }
    const b = this.positions.length;
    for (const L of polygons) {
      for (let QA = 0; QA < L.length; QA++) {
        if (this.ringArea(L[QA]) > 0 != (QA === 0)) {
          L[QA].reverse();
        }
      }
      if (x) {
        const QA = L[0];
        let sA = 0;
        let _ = 0;
        for (let gA = 0; gA < QA.length - 1; gA++) {
          sA += QA[gA][0];
          _ += QA[gA][1];
        }
        sA /= QA.length - 1;
        _ /= QA.length - 1;
        for (let gA = 0; gA < 32; gA++) {
          const EA = gA / 32;
          const iA = (gA + 1) / 32;
          const CA = Math.sqrt(0.55 ** 2 + (1 - 0.55 ** 2) * ((EA - 0.65) / 0.65) ** 2);
          const v = Math.sqrt(0.55 ** 2 + (1 - 0.55 ** 2) * ((iA - 0.65) / 0.65) ** 2);
          for (let MA = 0; MA < QA.length - 1; MA++) {
            const rA = QA[MA];
            const tA = QA[MA + 1];
            const KA = [sA + (rA[0] - sA) * CA, _ + (rA[1] - _) * CA, Y + (N - Y) * EA];
            const eA = [sA + (tA[0] - sA) * CA, _ + (tA[1] - _) * CA, KA[2]];
            const aA = [sA + (tA[0] - sA) * v, _ + (tA[1] - _) * v, Y + (N - Y) * iA];
            const hA = [sA + (rA[0] - sA) * v, _ + (rA[1] - _) * v, aA[2]];
            this.triangle(KA, eA, aA, j);
            this.triangle(KA, aA, hA, j);
          }
        }
        continue;
      }
      const p =
        E === 'flat'
          ? {
              x: 1,
              y: 0,
              min: 0,
              max: 1,
            }
          : this.roofAxis(L[0], properties);
      const Z = G.get(L);
      const V = q
        ? Math.max(1, Math.ceil(e / u))
        : E === 'sawtooth'
          ? Math.max(1, Math.ceil((p.max - p.min) / 6))
          : 1;
      const z = {
        x: -p.y,
        y: p.x,
        min: 1 / 0,
        max: -1 / 0,
      };
      for (const QA of L[0]) {
        const sA = QA[0] * z.x + QA[1] * z.y;
        z.min = Math.min(z.min, sA);
        z.max = Math.max(z.max, sA);
      }
      const DA = E === 'gambrel' ? [0, t / 2, 0.5, 1 - t / 2, 1] : [0, 0.5, 1];
      if (
        (E === 'double_saltbox' && DA.splice(0, DA.length, 0, 0.25, 0.75, 1), q || E === 'sawtooth')
      ) {
        DA.length = 0;
        for (let QA = 0; QA <= V; QA++) {
          DA.push(q ? Math.max(0, 1 - ((V - QA) * u) / (e || u)) : QA / V);
        }
      }
      if (E === 'round') {
        DA.length = 0;
        for (let QA = 0; QA <= 64; QA++) {
          DA.push((1 - Math.cos((QA * Math.PI) / 64)) / 2);
        }
      }
      const yA = (QA, sA, _) => {
        const gA = Math.max(0, Math.min(1, (QA * p.x + sA * p.y - p.min) / (p.max - p.min || 1)));
        if (Z) {
          return U;
        }
        if (q) {
          return U + Math.min(e, Math.max(1, Math.ceil(((1 - (_ ?? gA)) * e) / u)) * u);
        }
        if (E === 'sawtooth') {
          return U + e * (1 - (gA * V - Math.min(V - 1, Math.floor((_ ?? gA) * V))));
        }
        if (E === 'skillion') {
          return U + e * (1 - gA);
        }
        if (E === 'gabled' || E === 'pitched') {
          return U + e * (1 - Math.abs(gA * 2 - 1));
        }
        if (E === 'double_saltbox') {
          return U + e * Math.min(1, Math.min(gA, 1 - gA) * 4);
        }
        if (E === 'half-hipped') {
          const EA = QA * z.x + sA * z.y;
          const iA = 0.55 + (Math.min(EA - z.min, z.max - EA) * 2) / (p.max - p.min);
          return U + e * Math.min(1 - Math.abs(gA * 2 - 1), iA);
        }
        if (E === 'gambrel') {
          const EA = 1 - Math.abs(gA * 2 - 1);
          const iA = EA <= t ? (EA / t) * y : y + ((EA - t) / (1 - t)) * (1 - y);
          return U + e * iA;
        }
        if (E === 'round') {
          const EA = Math.min(63, Math.floor((Math.acos(1 - gA * 2) / Math.PI) * 64));
          const iA = DA[EA];
          const CA = DA[EA + 1];
          const v = (gA - iA) / (CA - iA);
          const MA =
            Math.sin((EA * Math.PI) / 64) * (1 - v) + Math.sin(((EA + 1) * Math.PI) / 64) * v;
          return U + e * MA;
        }
        return U;
      };
      if (Z) {
        const QA = Z;
        let sA = 0;
        for (const _ of QA.vertices) {
          sA = Math.max(sA, _[2]);
        }
        for (const _ of QA.polygons) {
          if (!F && QA.wallFaces.has(_)) {
            continue;
          }
          const gA = QA.wallFaces.has(_) ? j : n;
          const EA = [];
          for (const v of _) {
            EA.push(QA.vertices[v]);
          }
          const iA = flatten([EA]);
          const CA = QA.wallFaces.has(_) ? [0, 1, 2] : earcut(iA.vertices, iA.holes, 3);
          for (let v = 0; v < CA.length; v += 3) {
            const MA = [];
            for (let tA = 0; tA < 3; tA++) {
              MA.push(EA[CA[v + tA]]);
            }
            const rA = [];
            if (
              E === 'mansard' ||
              E === 'gambrel' ||
              E === 'quadruple_saltbox' ||
              E === 'double_saltbox'
            ) {
              const tA = sA * (E.includes('saltbox') ? 0.5 : t);
              rA.push(this.clipScalar(MA, 0, tA), this.clipScalar(MA, tA, sA));
            } else if (E === 'dome' || E === 'onion') {
              for (let tA = 0; tA < 32; tA++) {
                rA.push(this.clipScalar(MA, (sA * tA) / 32, (sA * (tA + 1)) / 32));
              }
            } else {
              rA.push(MA);
            }
            for (const tA of rA) {
              const KA = [];
              for (const eA of tA) {
                const aA = eA[2] / (sA || 1);
                let hA = aA;
                if (E === 'mansard' || E === 'gambrel') {
                  hA = aA <= t ? (aA / t) * y : y + ((aA - t) / (1 - t)) * (1 - y);
                }
                if (E.includes('saltbox')) {
                  hA = Math.min(1, aA * 2);
                }
                if (E === 'dome') {
                  hA = Math.sqrt(Math.max(0, 1 - (1 - aA) ** 2));
                }
                if (E === 'onion') {
                  hA = (1 - Math.cos(aA * Math.PI)) / 2;
                }
                KA.push([eA[0], eA[1], U + e * hA]);
              }
              for (let eA = 1; eA < KA.length - 1; eA++) {
                const aA = KA[0];
                const hA = KA[eA];
                const uA = KA[eA + 1];
                const ig = (hA[0] - aA[0]) * (uA[1] - aA[1]) - (hA[1] - aA[1]) * (uA[0] - aA[0]);
                this.triangle(aA, ig < 0 ? uA : hA, ig < 0 ? hA : uA, gA);
              }
            }
          }
        }
      } else if (['pyramidal', 'pyramid', 'dome', 'onion'].includes(E)) {
        let QA = 0;
        let sA = 0;
        const _ = L[0];
        for (let gA = 0; gA < _.length - 1; gA++) {
          const EA = _[gA];
          QA += EA[0];
          sA += EA[1];
        }
        if (((QA /= _.length - 1), (sA /= _.length - 1), E === 'pyramidal' || E === 'pyramid')) {
          for (let gA = 0; gA < _.length - 1; gA++) {
            this.triangle([..._[gA], U], [..._[gA + 1], U], [QA, sA, N], n);
          }
        } else {
          const gA = [];
          for (let iA = 0; iA < _.length - 1; iA++) {
            const CA = _[iA];
            const v = _[iA + 1];
            const MA = Math.max(1, Math.ceil(Math.hypot(v[0] - CA[0], v[1] - CA[1]) / 0.7));
            for (let rA = 0; rA < MA; rA++) {
              gA.push([CA[0] + ((v[0] - CA[0]) * rA) / MA, CA[1] + ((v[1] - CA[1]) * rA) / MA]);
            }
          }
          const EA = (iA, CA) => {
            const v =
              E === 'dome'
                ? Math.cos((CA * Math.PI) / 2)
                : (1 - CA) * (1 + 2.4 * CA) * Math.cos((CA * Math.PI) / 2);
            const MA = E === 'dome' ? Math.sin((CA * Math.PI) / 2) : CA;
            return [QA + (iA[0] - QA) * v, sA + (iA[1] - sA) * v, U + e * MA];
          };
          for (let iA = 0; iA < 48; iA++) {
            for (let CA = 0; CA < gA.length; CA++) {
              const v = gA[CA];
              const MA = gA[(CA + 1) % gA.length];
              const rA = EA(v, iA / 48);
              const tA = EA(MA, iA / 48);
              const KA = EA(MA, (iA + 1) / 48);
              const eA = EA(v, (iA + 1) / 48);
              this.triangle(rA, tA, KA, n);
              this.triangle(rA, KA, eA, n);
            }
          }
        }
      } else if (E === 'half-hipped') {
        const QA = flatten(L);
        const sA = earcut(QA.vertices, QA.holes, 2);
        const _ = p.max - p.min;
        const gA = [
          [(2 * p.x) / _, (2 * p.y) / _, (-2 * p.min) / _],
          [(-2 * p.x) / _, (-2 * p.y) / _, (2 * p.max) / _],
          [(2 * z.x) / _, (2 * z.y) / _, 0.55 - (2 * z.min) / _],
          [(-2 * z.x) / _, (-2 * z.y) / _, 0.55 + (2 * z.max) / _],
        ];
        for (let EA = 0; EA < sA.length; EA += 3) {
          for (const iA of gA) {
            let CA = [];
            for (let v = 0; v < 3; v++) {
              CA.push([QA.vertices[sA[EA + v] * 2], QA.vertices[sA[EA + v] * 2 + 1], 0]);
            }
            for (const v of gA) {
              if (iA !== v) {
                for (const MA of CA) {
                  MA[2] = (v[0] - iA[0]) * MA[0] + (v[1] - iA[1]) * MA[1] + v[2] - iA[2];
                }
                CA = this.clipScalar(CA, 0, 1 / 0);
              }
            }
            for (const v of CA) {
              v[2] = U + e * (iA[0] * v[0] + iA[1] * v[1] + iA[2]);
            }
            for (let v = 1; v < CA.length - 1; v++) {
              this.triangle(CA[0], CA[v], CA[v + 1], n);
            }
          }
        }
      } else if (q || ['gabled', 'gambrel', 'round', 'double_saltbox', 'sawtooth'].includes(E)) {
        const QA = flatten(L);
        const sA = earcut(QA.vertices, QA.holes, 2);
        for (let _ = 0; _ < sA.length; _ += 3) {
          const gA = [];
          let EA = 1;
          let iA = 0;
          for (let CA = 0; CA < 3; CA++) {
            const v = sA[_ + CA] * 2;
            const MA = QA.vertices[v];
            const rA = QA.vertices[v + 1];
            const tA = Math.max(
              0,
              Math.min(1, (MA * p.x + rA * p.y - p.min) / (p.max - p.min || 1)),
            );
            gA.push([MA, rA, tA]);
            EA = Math.min(EA, tA);
            iA = Math.max(iA, tA);
          }
          for (let CA = 0; CA < DA.length - 1; CA++) {
            const v = DA[CA];
            const MA = DA[CA + 1];
            if (iA <= v || EA >= MA) {
              continue;
            }
            const rA = this.clipScalar(gA, v, MA);
            const tA = [];
            for (const KA of rA) {
              tA.push([KA[0], KA[1], yA(KA[0], KA[1], (v + MA) / 2)]);
            }
            for (let KA = 1; KA < tA.length - 1; KA++) {
              const eA = tA[0];
              const aA = tA[KA];
              const hA = tA[KA + 1];
              const uA = (aA[0] - eA[0]) * (hA[1] - eA[1]) - (aA[1] - eA[1]) * (hA[0] - eA[0]);
              this.triangle(eA, uA < 0 ? hA : aA, uA < 0 ? aA : hA, n);
            }
          }
          if (q || E === 'sawtooth') {
            for (let CA = 1; CA < DA.length - 1; CA++) {
              const v = DA[CA];
              const MA = [];
              for (let HA = 0; HA < 3; HA++) {
                const XA = gA[HA];
                const Ig = gA[(HA + 1) % 3];
                if ((XA[2] === v && MA.push(XA), (XA[2] - v) * (Ig[2] - v) < 0)) {
                  const og = (v - XA[2]) / (Ig[2] - XA[2]);
                  MA.push([XA[0] + (Ig[0] - XA[0]) * og, XA[1] + (Ig[1] - XA[1]) * og, v]);
                }
              }
              if (MA.length !== 2 || EA === v || iA === v) {
                continue;
              }
              const rA = MA[0];
              const tA = MA[1];
              const KA = (DA[CA - 1] + v) / 2;
              const eA = (v + DA[CA + 1]) / 2;
              const aA = [rA[0], rA[1], yA(rA[0], rA[1], KA)];
              const hA = [tA[0], tA[1], yA(tA[0], tA[1], KA)];
              const uA = [tA[0], tA[1], yA(tA[0], tA[1], eA)];
              const ig = [rA[0], rA[1], yA(rA[0], rA[1], eA)];
              this.triangle(aA, hA, uA, n);
              this.triangle(aA, uA, ig, n);
            }
          }
        }
      } else {
        this.face(L, E === 'flat' ? () => N : yA, n);
      }
      if (F) {
        if (Y > 0) {
          this.face(L, () => Y, j, true);
        }
        for (const QA of L) {
          for (let sA = 0; sA < QA.length - 1; sA++) {
            const _ = QA[sA];
            const gA = QA[sA + 1];
            const EA = [0, 1];
            const iA = _[0] * p.x + _[1] * p.y;
            const CA = gA[0] * p.x + gA[1] * p.y;
            if (
              !Z &&
              (q ||
                [
                  'gabled',
                  'gambrel',
                  'round',
                  'double_saltbox',
                  'half-hipped',
                  'sawtooth',
                ].includes(E)) &&
              Math.abs(CA - iA) > 1e-8
            ) {
              for (let v = 1; v < DA.length - 1; v++) {
                const rA = (p.min + (p.max - p.min) * DA[v] - iA) / (CA - iA);
                if (rA > 1e-8 && rA < 1 - 1e-8) {
                  EA.push(rA);
                }
              }
            }
            if (E === 'half-hipped') {
              const v = p.max - p.min;
              const MA = (KA) => [
                (2 * (KA[0] * p.x + KA[1] * p.y - p.min)) / v,
                (2 * (p.max - KA[0] * p.x - KA[1] * p.y)) / v,
                0.55 + (2 * (KA[0] * z.x + KA[1] * z.y - z.min)) / v,
                0.55 + (2 * (z.max - KA[0] * z.x - KA[1] * z.y)) / v,
              ];
              const rA = MA(_);
              const tA = MA(gA);
              for (let KA = 0; KA < 4; KA++) {
                for (let eA = KA + 1; eA < 4; eA++) {
                  const aA = rA[KA] - rA[eA];
                  const hA = tA[KA] - tA[eA];
                  const uA = aA / (aA - hA);
                  if (uA > 1e-8 && uA < 1 - 1e-8) {
                    EA.push(uA);
                  }
                }
              }
            }
            EA.sort((v, MA) => v - MA);
            for (let v = 0; v < EA.length - 1; v++) {
              const MA = EA[v];
              const rA = EA[v + 1];
              const tA = [_[0] + (gA[0] - _[0]) * MA, _[1] + (gA[1] - _[1]) * MA];
              const KA = [_[0] + (gA[0] - _[0]) * rA, _[1] + (gA[1] - _[1]) * rA];
              const eA = (iA + ((CA - iA) * (MA + rA)) / 2 - p.min) / (p.max - p.min || 1);
              const aA = E === 'flat' ? N : yA(...tA, eA);
              const hA = E === 'flat' ? N : yA(...KA, eA);
              this.triangle([...tA, Y], [...KA, Y], [...KA, hA], j);
              this.triangle([...tA, Y], [...KA, hA], [...tA, aA], j);
            }
          }
        }
      }
    }
    const m = [1 / 0, 1 / 0, 1 / 0, -1 / 0, -1 / 0, -1 / 0];
    for (let L = b; L < this.positions.length; L += 3) {
      for (let p = 0; p < 3; p++) {
        m[p] = Math.min(m[p], this.positions[L + p]);
        m[p + 3] = Math.max(m[p + 3], this.positions[L + p]);
      }
    }
    Object.assign(feature, {
      height: N,
      minHeight: Y,
      roofHeight: e,
      roofShape: E,
      inferred: s,
      bounds: m,
      startTriangle: b / 9,
      triangleCount: (this.positions.length - b) / 9,
    });
    this.stats.inferred += s.length > 0 ? 1 : 0;
    this.stats.roofs += E !== 'flat' ? 1 : 0;
    return this.positions.length > b;
  }
  build(features) {
    this.positions = [];
    this.colors = [];
    this.materials = [];
    this.warnings = [];
    this.stats = {
      buildings: 0,
      parts: 0,
      triangles: 0,
      inferred: 0,
      unsupported: 0,
      roofs: 0,
      orphanParts: 0,
      outlines: 0,
    };
    const C = [];
    const Q = [];
    for (const t of features) {
      const y = this.tags(t.properties);
      const Y = t.id;
      if (
        !['Polygon', 'MultiPolygon'].includes(t.geometry?.type) ||
        ((!y.building || y.building === 'no') &&
          (!y['building:part'] || y['building:part'] === 'no'))
      ) {
        continue;
      }
      const N = this.project(t.geometry);
      const a = !!(y['building:part'] && y['building:part'] !== 'no');
      const K = !!(y.building && y.building !== 'no');
      let e = 0;
      const G = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
      for (const J of N) {
        for (const S of J) {
          e += this.ringArea(S);
        }
        for (const S of J[0]) {
          G[0] = Math.min(G[0], S[0]);
          G[1] = Math.min(G[1], S[1]);
          G[2] = Math.max(G[2], S[0]);
          G[3] = Math.max(G[3], S[1]);
        }
      }
      if (e <= 0) {
        this.warnings.push({
          id: Y,
          code: 'invalid-footprint',
          message: '建筑轮廓没有有效面积',
        });
        continue;
      }
      C.push({
        id: Y,
        tags: y,
        part: a,
        outline: K,
        polygons: N,
        area: e,
        bounds: G,
        parts: [],
        feature: t,
      });
    }
    const i = [];
    const E = new Map();
    for (const t of C) {
      if (t.outline) {
        for (const y of t.polygons) {
          i.push(y);
          E.set(y, t);
        }
      }
    }
    const s = new PolygonGrid(i, 64);
    for (const t of C) {
      if (!t.part) {
        continue;
      }
      let y = null;
      const Y = new Set();
      for (const N of t.polygons) {
        for (const a of s.query(N[0])) {
          Y.add(E.get(a));
        }
      }
      for (const N of Y) {
        if (!(
          N === t ||
          N.area < t.area ||
          (y && N.area >= y.area) ||
          t.bounds[0] < N.bounds[0] - 0.000001 ||
          t.bounds[1] < N.bounds[1] - 0.000001 ||
          t.bounds[2] > N.bounds[2] + 0.000001 ||
          t.bounds[3] > N.bounds[3] + 0.000001
        )) {
          if (polygonClipping.difference(t.polygons, N.polygons).length === 0) {
            y = N;
          }
        }
      }
      if (y) {
        const N = {};
        for (const [a, K] of Object.entries(y.tags)) {
          if (
            a.startsWith('building') ||
            a.startsWith('roof:') ||
            ['height', 'min_height', 'colour', 'color', 'material', 'wall'].includes(a)
          ) {
            N[a] = K;
          }
        }
        t.tags = {
          ...N,
          ...t.tags,
        };
        t.parent = y;
        for (const a of Y) {
          if (a !== t && polygonClipping.intersection(t.polygons, a.polygons).length) {
            a.parts.push(t);
          }
        }
      }
    }
    for (const t of [true, false]) {
      for (const y of C) {
        if (y.part !== t) {
          continue;
        }
        if (y.part && !y.outline && !y.parent) {
          this.stats.orphanParts++;
          continue;
        }
        if (
          y.outline &&
          (y.tags['building:part'] === 'no' ||
            ['vertical', 'horizontal'].includes(y.tags['building:parts']))
        ) {
          this.stats.outlines++;
          continue;
        }
        const Y = [];
        if (y.tags['building:part'] !== 'yes') {
          for (const K of y.parts) {
            if (K.rendered) {
              Y.push(K.polygons);
            }
          }
        }
        const N = Y.length ? polygonClipping.difference(y.polygons, ...Y) : y.polygons;
        if (!N.length) {
          this.stats.outlines++;
          continue;
        }
        const a = {
          id: y.id,
          properties: {
            ...y.tags,
          },
          sourceProperties: {
            ...y.feature.properties,
          },
          part: y.part,
          parentId: y.parent?.id,
        };
        if (this.mesh(N, y.tags, a)) {
          y.rendered = a;
          Q.push(a);
          this.stats.buildings++;
          this.stats.parts += y.part ? 1 : 0;
        }
      }
    }
    const w = CoplanarClipping.resolve(this.positions, this.colors, Q, this.materials);
    this.stats.triangles = w.positions.length / 9;
    this.stats.coplanarClipped = w.clipped;
    this.stats.buildings = w.features.length;
    this.stats.parts = w.features.filter((t) => t.part).length;
    return {
      positions: new Float32Array(w.positions),
      colors: new Float32Array(w.colors),
      materials: new Float32Array(w.materials),
      features: w.features,
      warnings: this.warnings,
      stats: this.stats,
    };
  }
}
export { BuildingGeometry };

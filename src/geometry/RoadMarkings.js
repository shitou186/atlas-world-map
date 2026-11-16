// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { PolygonGrid } from './PolygonGrid.js';
import ClipperLib from 'clipper-lib';
class RoadMarkings {
  constructor(A) {
    this.landscape = A;
    this.roads = A.roads;
    const C = new Map();
    for (const Q of this.roads) {
      Q.nodes = [];
      for (let i = 0; i < Q.points.length; i++) {
        const E = Q.points[i];
        const s = E[0].toFixed(4) + '/' + E[1].toFixed(4);
        if (!C.has(s)) {
          C.set(s, {
            roads: new Set(),
            degree: 0,
          });
        }
        const w = C.get(s);
        w.roads.add(Q);
        w.degree += (i > 0 ? 1 : 0) + (i < Q.points.length - 1 ? 1 : 0);
        Q.nodes.push(w);
      }
    }
    this.owners = new Map();
    for (const Q of this.roads) {
      if (!Q.path) {
        this.owners.set(Q.polygon, Q);
      }
    }
    this.grid = new PolygonGrid([...this.owners.keys()], 64);
  }
  build() {
    for (const A of this.roads) {
      if (A.path || A.tags.lane_markings === 'no' || A.kind !== 'asphalt') {
        continue;
      }
      const C = [];
      for (const t of this.grid.query(A.polygon[0])) {
        if (this.owners.get(t) !== A) {
          C.push(t);
        }
      }
      const Q = [0];
      const i = [];
      for (let t = 0; t < A.points.length; t++) {
        const y = A.points[t];
        const Y = A.points[Math.max(0, t - 1)];
        const N = A.points[Math.min(A.points.length - 1, t + 1)];
        const a = Math.hypot(y[0] - Y[0], y[1] - Y[1]);
        const K = Math.hypot(N[0] - y[0], N[1] - y[1]);
        const e = a ? -(y[1] - Y[1]) / a : -(N[1] - y[1]) / K;
        const G = a ? (y[0] - Y[0]) / a : (N[0] - y[0]) / K;
        const J = K ? -(N[1] - y[1]) / K : e;
        const S = K ? (N[0] - y[0]) / K : G;
        const U = Math.max(0.25, 1 + e * J + G * S);
        i.push([(e + J) / U, (G + S) / U]);
        if (t) {
          Q.push(Q.at(-1) + a);
        }
      }
      const E = [];
      for (let t = 0; t < A.nodes.length; t++) {
        const y = A.nodes[t];
        if (y.degree < 3) {
          continue;
        }
        let Y = 2;
        for (const N of y.roads) {
          if (!N.path) {
            Y = Math.max(Y, N.width / 2 + 2);
          }
        }
        E.push([Q[t] - Y, Q[t] + Y]);
      }
      const s = [];
      for (let t = 0; t <= A.lanes; t++) {
        const y = t === 0 || t === A.lanes;
        if (y && ['residential', 'service', 'living_street'].includes(A.tags.highway)) {
          continue;
        }
        const Y = y ? (t ? 1 : -1) * (A.width / 2 - 0.28) : A.width * (t / A.lanes - 0.5);
        for (let N = 1; N < A.points.length; N++) {
          const a = A.points[N - 1];
          const K = A.points[N];
          const e = Q[N] - Q[N - 1];
          const G = Q[N - 1];
          const J = Q[N];
          for (let S = y ? G : Math.floor(G / 8) * 8; S < J; S += y ? e : 8) {
            const U = Math.max(G, S);
            const j = Math.min(J, S + (y ? e : 3));
            if (j <= U) {
              continue;
            }
            let n = [[U, j]];
            for (const F of E) {
              const q = [];
              for (const u of n) {
                if (F[1] <= u[0] || F[0] >= u[1]) {
                  q.push(u);
                } else {
                  if (F[0] > u[0]) {
                    q.push([u[0], F[0]]);
                  }
                  if (F[1] < u[1]) {
                    q.push([F[1], u[1]]);
                  }
                }
              }
              n = q;
            }
            for (const F of n) {
              const q = [];
              for (const [u, x] of [
                [F[0], -0.07],
                [F[1], -0.07],
                [F[1], 0.07],
                [F[0], 0.07],
              ]) {
                const b = (u - G) / e;
                const m = [
                  i[N - 1][0] + (i[N][0] - i[N - 1][0]) * b,
                  i[N - 1][1] + (i[N][1] - i[N - 1][1]) * b,
                ];
                q.push([
                  a[0] + (K[0] - a[0]) * b + m[0] * (Y + x),
                  a[1] + (K[1] - a[1]) * b + m[1] * (Y + x),
                ]);
              }
              q.push(q[0]);
              s.push([q]);
            }
          }
        }
      }
      const w = C.length ? this.landscape.combine(s, C) : s;
      this.landscape.surface(w, 'markings', A, '#f2efe4');
    }
  }
  ground(A, C) {
    const Q = new PolygonGrid(A, 64);
    const i = new PolygonGrid(C, 64);
    for (const [E, s] of Q.cells) {
      const [w, t] = E.split('/').map(Number);
      const y = w * 64;
      const Y = t * 64;
      const N = [
        [y, Y],
        [y + 64, Y],
        [y + 64, Y + 64],
        [y, Y + 64],
        [y, Y],
      ];
      const a = i.query(N);
      if (!a.length) {
        continue;
      }
      const K = this.landscape.combine(
        s.map((G) => G.polygon),
        [[N]],
        ClipperLib.ClipType.ctIntersection,
      );
      const e = this.landscape.combine(K, a, ClipperLib.ClipType.ctIntersection);
      this.landscape.topology.roadMarkings.push(...e);
    }
  }
}
export { RoadMarkings };

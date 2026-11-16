// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { Color } from 'three';
import ClipperLib from 'clipper-lib';
class StreetFurniture {
  constructor(A) {
    this.landscape = A;
    this.furniture = [];
    this.counts = {
      walls: 0,
      fences: 0,
      railways: 0,
      pitches: 0,
      tracks: 0,
      benches: 0,
      busStops: 0,
      fountains: 0,
      sculptures: 0,
    };
    this.railways = [];
    this.sleepers = [];
    this.colors = new Map();
  }
  triangles(A, C, Q) {
    const i = (this.landscape.buffers[C] ||= {
      positions: [],
      colors: [],
    });
    if (!this.colors.has(Q)) {
      this.colors.set(Q, new Color(Q).toArray());
    }
    const E = this.colors.get(Q);
    for (const s of A) {
      i.positions.push(...s);
      i.colors.push(...E);
    }
  }
  beam(A, C, Q, i, E, s = 'structures') {
    const w = Math.hypot(C[0] - A[0], C[1] - A[1]);
    if (w < 0.001) {
      return;
    }
    const t = ((-(C[1] - A[1]) / w) * Q) / 2;
    const y = (((C[0] - A[0]) / w) * Q) / 2;
    const Y = [
      [A[0] + t, A[1] + y, A[2]],
      [A[0] - t, A[1] - y, A[2]],
      [C[0] - t, C[1] - y, C[2]],
      [C[0] + t, C[1] + y, C[2]],
    ];
    for (let a = 0; a < 4; a++) {
      Y.push([Y[a][0], Y[a][1], Y[a][2] + i]);
    }
    const N = [
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3,
      0, 4, 3, 4, 7,
    ];
    this.triangles(
      N.map((a) => Y[a]),
      s,
      E,
    );
  }
  rectangle(A) {
    const C = A.slice(0, -1).sort((E, s) => E[0] - s[0] || E[1] - s[1]);
    const Q = [];
    for (const E of [C, [...C].reverse()]) {
      const s = Q.length;
      for (const w of E) {
        for (; Q.length >= s + 2;) {
          const t = Q.at(-2);
          const y = Q.at(-1);
          if ((y[0] - t[0]) * (w[1] - t[1]) - (y[1] - t[1]) * (w[0] - t[0]) > 0) {
            break;
          }
          Q.pop();
        }
        Q.push(w);
      }
      Q.pop();
    }
    let i = null;
    for (let E = 0; E < Q.length; E++) {
      const s = Q[E];
      const w = Q[(E + 1) % Q.length];
      const t = Math.hypot(w[0] - s[0], w[1] - s[1]);
      if (!t) {
        continue;
      }
      const y = (w[0] - s[0]) / t;
      const Y = (w[1] - s[1]) / t;
      let N = 1 / 0;
      let a = -1 / 0;
      let K = 1 / 0;
      let e = -1 / 0;
      for (const J of Q) {
        const S = J[0] * y + J[1] * Y;
        const U = -J[0] * Y + J[1] * y;
        N = Math.min(N, S);
        a = Math.max(a, S);
        K = Math.min(K, U);
        e = Math.max(e, U);
      }
      const G = (a - N) * (e - K);
      if (!(i && i.area <= G)) {
        i = {
          area: G,
          center: [((N + a) / 2) * y - ((K + e) / 2) * Y, ((N + a) / 2) * Y + ((K + e) / 2) * y],
          length: a - N,
          width: e - K,
          angle: Math.atan2(Y, y),
        };
      }
    }
    if (i && i.width > i.length) {
      [i.width, i.length] = [i.length, i.width];
      i.angle += Math.PI / 2;
    }
    return i;
  }
  pitch(A, C, Q = 0) {
    const i = this.landscape;
    const E = this.rectangle(A[0]);
    if (!E || E.width < 3 || E.length < 6) {
      return [];
    }
    const s = [];
    const w = E.length - 0.4;
    const t = E.width - 0.4;
    if (C === 'soccer' || C === 'football') {
      s.push(
        [
          [-w / 2, -t / 2],
          [w / 2, -t / 2],
          [w / 2, t / 2],
          [-w / 2, t / 2],
          [-w / 2, -t / 2],
        ],
        [
          [0, -t / 2],
          [0, t / 2],
        ],
      );
      const Y = Math.min(1, w / 90, t / 45);
      const N = [];
      for (let a = 0; a <= 64; a++) {
        N.push([Math.cos((a * Math.PI) / 32) * 9.15 * Y, Math.sin((a * Math.PI) / 32) * 9.15 * Y]);
      }
      s.push(N);
      for (const a of [-1, 1]) {
        for (const [K, e] of [
          [16.5, 40.32],
          [5.5, 18.32],
        ]) {
          s.push([
            [(a * w) / 2, (-e * Y) / 2],
            [a * (w / 2 - K * Y), (-e * Y) / 2],
            [a * (w / 2 - K * Y), (e * Y) / 2],
            [(a * w) / 2, (e * Y) / 2],
          ]);
        }
      }
    } else if (C === 'tennis') {
      s.push([
        [-w / 2, -t / 2],
        [w / 2, -t / 2],
        [w / 2, t / 2],
        [-w / 2, t / 2],
        [-w / 2, -t / 2],
      ]);
      for (const e of [-1, 1]) {
        s.push([
          [-w / 2, (e * t * 8.23) / 10.97 / 2],
          [w / 2, (e * t * 8.23) / 10.97 / 2],
        ]);
        s.push([
          [(e * w * 6.4) / 23.77, (-t * 8.23) / 10.97 / 2],
          [(e * w * 6.4) / 23.77, (t * 8.23) / 10.97 / 2],
        ]);
      }
      s.push([
        [(-w * 6.4) / 23.77, 0],
        [(w * 6.4) / 23.77, 0],
      ]);
      const Y = (-Math.sin(E.angle) * t) / 2;
      const N = (Math.cos(E.angle) * t) / 2;
      const a = [E.center[0] - Y, E.center[1] - N, Q + 0.1];
      const K = [E.center[0] + Y, E.center[1] + N, Q + 0.1];
      this.triangles(
        [a, K, [K[0], K[1], Q + 1.05], a, [K[0], K[1], Q + 1.05], [a[0], a[1], Q + 1.05]],
        'fenceMesh',
        '#6d746b',
      );
      this.beam([a[0], a[1], Q + 1.05], [K[0], K[1], Q + 1.05], 0.035, 0.035, '#eee9dc');
      for (const e of [a, K]) {
        this.beam(
          [e[0] - 0.035, e[1], Q + 0.05],
          [e[0] + 0.035, e[1], Q + 0.05],
          0.07,
          1.07,
          '#596866',
        );
      }
    } else if (C === 'basketball' || C === 'volleyball') {
      if (
        (s.push(
          [
            [-w / 2, -t / 2],
            [w / 2, -t / 2],
            [w / 2, t / 2],
            [-w / 2, t / 2],
            [-w / 2, -t / 2],
          ],
          [
            [0, -t / 2],
            [0, t / 2],
          ],
        ),
        C === 'basketball')
      ) {
        const Y = Math.min(w / 28, t / 15);
        const N = [];
        for (let a = 0; a <= 48; a++) {
          N.push([Math.cos((a * Math.PI) / 24) * 1.8 * Y, Math.sin((a * Math.PI) / 24) * 1.8 * Y]);
        }
        s.push(N);
        for (const a of [-1, 1]) {
          s.push([
            [(a * w) / 2, -2.45 * Y],
            [a * (w / 2 - 5.8 * Y), -2.45 * Y],
            [a * (w / 2 - 5.8 * Y), 2.45 * Y],
            [(a * w) / 2, 2.45 * Y],
          ]);
          const K = [];
          for (let e = 0; e <= 48; e++) {
            const G = -Math.PI / 2 + (e * Math.PI) / 48;
            K.push([a * (w / 2 - 1.575 * Y - Math.cos(G) * 6.75 * Y), Math.sin(G) * 6.75 * Y]);
          }
          s.push(K);
        }
      } else {
        for (const Y of [-1, 1]) {
          s.push([
            [(Y * w) / 6, -t / 2],
            [(Y * w) / 6, t / 2],
          ]);
        }
      }
    } else {
      return [];
    }
    const y = [];
    for (const Y of s) {
      y.push(
        i.ribbon(
          Y.map((N) => [
            E.center[0] + N[0] * Math.cos(E.angle) - N[1] * Math.sin(E.angle),
            E.center[1] + N[0] * Math.sin(E.angle) + N[1] * Math.cos(E.angle),
          ]),
          0.07,
        ),
      );
    }
    return i.combine(y, [A], ClipperLib.ClipType.ctIntersection);
  }
  build(A) {
    const C = this.landscape;
    const Q = new Set();
    for (const i of A) {
      const E = `${i.id}/${JSON.stringify(i.geometry)}/${JSON.stringify(i.properties)}`;
      if (Q.has(E)) {
        continue;
      }
      Q.add(E);
      const s = i.properties;
      const w = i.geometry;
      if (
        w.type === 'Point' &&
        (s.highway === 'bus_stop' ||
          ['bench', 'fountain'].includes(s.amenity) ||
          s.tourism === 'artwork' ||
          s.historic === 'memorial')
      ) {
        const t = C.point(w.coordinates);
        const y = s.highway === 'bus_stop' ? 'busStop' : s.amenity || 'sculpture';
        let Y = Number.isFinite(s.direction) ? Math.PI / 2 - (s.direction * Math.PI) / 180 : 0;
        let N = 30;
        if (!Number.isFinite(s.direction)) {
          for (const a of C.roads) {
            for (let K = 1; K < a.points.length; K++) {
              const e = a.points[K - 1];
              const G = a.points[K];
              const J = G[0] - e[0];
              const S = G[1] - e[1];
              const U = Math.max(
                0,
                Math.min(1, ((t[0] - e[0]) * J + (t[1] - e[1]) * S) / (J * J + S * S)),
              );
              const j = e[0] + J * U - t[0];
              const n = e[1] + S * U - t[1];
              const F = Math.hypot(j, n);
              if (F < N) {
                N = F;
                Y = Math.atan2(n, j) - Math.PI / 2;
              }
            }
          }
        }
        this.furniture.push({
          id: i.id,
          kind: y,
          x: t[0],
          y: t[1],
          z: 0.24,
          angle: Y,
        });
        this.counts[
          y === 'busStop'
            ? 'busStops'
            : y === 'bench'
              ? 'benches'
              : y === 'sculpture'
                ? 'sculptures'
                : 'fountains'
        ]++;
      }
      if (w.type === 'LineString' && (s.barrier || s.railway)) {
        const t = w.coordinates
          .map((y) => C.point(y))
          .filter((y, Y, N) => !Y || Math.hypot(y[0] - N[Y - 1][0], y[1] - N[Y - 1][1]) > 0.001);
        if (t.length < 2) {
          continue;
        }
        if (s.barrier === 'wall') {
          const y = s.height > 0 ? s.height : 1.6;
          const Y = s.width > 0 ? s.width : 0.3;
          C.surface(
            [C.ribbon(t, Y)],
            'structures',
            y,
            s.wall === 'brick' ? '#a9937c' : '#b6b2a5',
            y,
          );
          C.surface([C.ribbon(t, Y + 0.06)], 'structures', y + 0.08, '#ccc8ba', 0.08);
          this.counts.walls++;
        }
        if (s.barrier === 'fence') {
          const y = s.height > 0 ? s.height : 1.25;
          const Y = s.fence_type || 'railing';
          let N = 0;
          for (let a = 1; a < t.length; a++) {
            const K = t[a - 1];
            const e = t[a];
            const G = Math.hypot(e[0] - K[0], e[1] - K[1]);
            for (const S of [0.35, y - 0.08]) {
              this.beam([...K, S], [...e, S], 0.045, 0.05, '#737b73');
            }
            const J = Y === 'railing' || Y === 'metal' ? 0.16 : Y === 'wood' ? 0.14 : 2.5;
            for (; N < G; N += J) {
              const S = K[0] + ((e[0] - K[0]) * N) / G;
              const U = K[1] + ((e[1] - K[1]) * N) / G;
              this.beam(
                [S - 0.018, U, 0.05],
                [S + 0.018, U, 0.05],
                Y === 'wood' ? 0.1 : 0.036,
                y,
                Y === 'wood' ? '#a2906d' : '#737b73',
              );
            }
            N -= G;
            if (['chain_link', 'wire', 'wire_mesh'].includes(Y)) {
              this.triangles(
                [
                  [...K, 0.15],
                  [...e, 0.15],
                  [...e, y],
                  [...K, 0.15],
                  [...e, y],
                  [...K, y],
                ],
                'fenceMesh',
                '#8c9790',
              );
            }
          }
          this.counts.fences++;
        }
        if (s.railway && !['abandoned', 'razed', 'proposed', 'construction'].includes(s.railway)) {
          const y = s.gauge > 0 ? s.gauge / 1000 : 1.435;
          const Y = s.railway === 'tram';
          this.railways.push({
            id: i.id,
            type: s.railway,
            gauge: y,
            points: new Float32Array(t.flatMap((a) => [a[0], a[1], Y ? 0.103 : 0.33])),
          });
          if (!Y) {
            C.topology.add([C.ribbon(t, y + 1.3)], 'ballast', 0.08, '#a49f93', i, 4, 'linear');
          }
          let N = 0;
          for (let a = 1; a < t.length; a++) {
            const K = t[a - 1];
            const e = t[a];
            const G = Math.hypot(e[0] - K[0], e[1] - K[1]);
            const J = -(e[1] - K[1]) / G;
            const S = (e[0] - K[0]) / G;
            if (!Y) {
              for (; N < G; N += 0.65) {
                const U = K[0] + ((e[0] - K[0]) * N) / G;
                const j = K[1] + ((e[1] - K[1]) * N) / G;
                this.sleepers.push(U, j, Math.atan2(S, J), y + 0.6);
              }
            }
            if (!Y) {
              N -= G;
            }
            for (const U of [-1, 1]) {
              const j = ((y + 0.07) / 2) * U;
              const n = Y ? 0.078 : 0.18;
              const F = [K[0] + J * j, K[1] + S * j, n];
              const q = [e[0] + J * j, e[1] + S * j, n];
              if (!Y) {
                this.beam(F, q, 0.14, 0.025, '#777d7e');
                this.beam([F[0], F[1], n + 0.025], [q[0], q[1], n + 0.025], 0.025, 0.1, '#777d7e');
              }
              this.beam(
                [F[0], F[1], n + (Y ? 0 : 0.125)],
                [q[0], q[1], n + (Y ? 0 : 0.125)],
                0.07,
                0.025,
                '#a8afb0',
              );
            }
          }
          this.counts.railways++;
        }
      }
      if (['Polygon', 'MultiPolygon'].includes(w.type) && ['pitch', 'track'].includes(s.leisure)) {
        const t = C.projection.project(w);
        const y =
          s.leisure === 'track' || s.surface === 'clay'
            ? '#b77a61'
            : s.sport === 'basketball'
              ? '#87a49a'
              : '#9aa876';
        const Y = C.topology.add(t, 'sport', 0.045, y, i, s.leisure === 'pitch' ? 70 : 50);
        for (const N of t) {
          if (
            (C.block(N),
            s.leisure === 'pitch' && Y.markings.push(...this.pitch(N, s.sport, Y.height - 0.045)),
            s.leisure === 'track' && s.sport === 'running')
          ) {
            const a = N[0].map((G) => ({
              X: Math.round(G[0] * 1000),
              Y: Math.round(G[1] * 1000),
            }));
            if (!ClipperLib.Clipper.Orientation(a)) {
              a.reverse();
            }
            const K = new ClipperLib.ClipperOffset(2, 10);
            const e = [];
            K.AddPath(a, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
            for (let G = 0; G <= (s.lanes > 0 ? s.lanes : 8); G++) {
              const J = [];
              K.Execute(J, -(0.12 + G * 1.22) * 1000);
              for (const S of J) {
                const U = S.map((j) => [j.X / 1000, j.Y / 1000]);
                if (!(U.length < 3)) {
                  U.push(U[0]);
                  e.push(C.ribbon(U, 0.05));
                }
              }
            }
            Y.markings.push(...C.combine(e, [N], ClipperLib.ClipType.ctIntersection));
          }
        }
        this.counts[s.leisure === 'pitch' ? 'pitches' : 'tracks']++;
      }
      if (
        ['Polygon', 'MultiPolygon'].includes(w.type) &&
        (['construction', 'brownfield', 'farmland'].includes(s.landuse) ||
          s.leisure === 'playground' ||
          s.aeroway === 'helipad')
      ) {
        const t = C.projection.project(w);
        const y =
          s.leisure === 'playground'
            ? '#c5a480'
            : s.aeroway === 'helipad'
              ? '#8d9990'
              : s.landuse === 'farmland'
                ? '#b5b17e'
                : '#b7aa92';
        const Y = C.topology.add(
          t,
          'land',
          0.035,
          y,
          i,
          s.aeroway === 'helipad' ? 80 : s.leisure === 'playground' ? 40 : 20,
        );
        for (const N of t) {
          if ((C.block(N), s.aeroway !== 'helipad')) {
            continue;
          }
          const a = this.rectangle(N[0]);
          if (!a || a.width < 3) {
            continue;
          }
          const K = Math.min(a.width, a.length) * 0.3;
          const e = [];
          for (const S of [-1, 1]) {
            e.push([
              [(S * K) / 2, -K],
              [(S * K) / 2, K],
            ]);
          }
          e.push([
            [-K / 2, 0],
            [K / 2, 0],
          ]);
          const G = [];
          for (let S = 0; S <= 64; S++) {
            G.push([
              Math.cos((S * Math.PI) / 32) * K * 1.4,
              Math.sin((S * Math.PI) / 32) * K * 1.4,
            ]);
          }
          e.push(G);
          const J = [];
          for (const S of e) {
            J.push(
              C.ribbon(
                S.map((U) => [
                  a.center[0] + U[0] * Math.cos(a.angle) - U[1] * Math.sin(a.angle),
                  a.center[1] + U[0] * Math.sin(a.angle) + U[1] * Math.cos(a.angle),
                ]),
                Math.max(0.1, K * 0.08),
              ),
            );
          }
          Y.markings.push(...C.combine(J, [N], ClipperLib.ClipType.ctIntersection));
        }
      }
    }
    return {
      furniture: this.furniture,
      railways: this.railways,
      sleepers: new Float32Array(this.sleepers),
      detailStats: this.counts,
    };
  }
}
export { StreetFurniture };

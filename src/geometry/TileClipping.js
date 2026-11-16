// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class TileClipping {
  static rectangle(A, C) {
    const Q = Math.PI / 180;
    const i = 6378137;
    const E = Math.cos(A[1] * Q);
    const s = Math.log(Math.tan(Math.PI / 4 + (A[1] * Q) / 2));
    let w = C.west;
    let t = C.east;
    for (; w - A[0] > 180;) {
      w -= 360;
    }
    for (; w - A[0] < -180;) {
      w += 360;
    }
    for (; t - A[0] > 180;) {
      t -= 360;
    }
    for (; t - A[0] < -180;) {
      t += 360;
    }
    if (t < w) {
      t += 360;
    }
    const y = [
      (w - A[0]) * Q * i * E,
      (Math.log(Math.tan(Math.PI / 4 + (C.south * Q) / 2)) - s) * i * E,
      (t - A[0]) * Q * i * E,
      (Math.log(Math.tan(Math.PI / 4 + (C.north * Q) / 2)) - s) * i * E,
    ];
    if (!y.every(Number.isFinite) || y[0] >= y[2] || y[1] >= y[3]) {
      throw new RangeError('场景分块边界无效。');
    }
    return y;
  }
  static clipMesh(A, C, Q = 0, i = A.positions.length / 9) {
    const E = ['positions', 'colors', 'materials'].filter((Y) => A[Y]);
    const s = Object.fromEntries(E.map((Y) => [Y, []]));
    const w = A.positions instanceof Float32Array ? C.map(Math.fround) : C;
    const t = Math.max(...w.map(Math.abs), 1) * Number.EPSILON * 32 + 1e-8;
    const y = [
      [0, w[0], 1],
      [0, w[2], -1],
      [1, w[1], 1],
      [1, w[3], -1],
    ];
    for (let Y = Q; Y < Q + i; Y++) {
      const N = Y * 9;
      const a = A.positions;
      const K = Math.min(a[N], a[N + 3], a[N + 6]);
      const e = Math.max(a[N], a[N + 3], a[N + 6]);
      const G = Math.min(a[N + 1], a[N + 4], a[N + 7]);
      const J = Math.max(a[N + 1], a[N + 4], a[N + 7]);
      if (e < w[0] - t || K > w[2] + t || J < w[1] - t || G > w[3] + t) {
        continue;
      }
      if (K > w[0] + t && e < w[2] - t && G > w[1] + t && J < w[3] - t) {
        const U = a[N + 3] - a[N];
        const j = a[N + 4] - a[N + 1];
        const n = a[N + 5] - a[N + 2];
        const F = a[N + 6] - a[N];
        const q = a[N + 7] - a[N + 1];
        const u = a[N + 8] - a[N + 2];
        if (Math.hypot(j * u - n * q, n * F - U * u, U * q - j * F) < 1e-10) {
          continue;
        }
        for (const x of E) {
          for (let b = 0; b < 9; b++) {
            s[x].push(A[x][N + b]);
          }
        }
        continue;
      }
      let S = [];
      for (let U = 0; U < 3; U++) {
        const j = Y * 3 + U;
        const n = [];
        for (const F of E) {
          n.push(A[F][j * 3], A[F][j * 3 + 1], A[F][j * 3 + 2]);
        }
        for (let F = 0; F < 2; F++) {
          for (const q of [w[F], w[F + 2]]) {
            if (Math.abs(n[F] - q) < t) {
              n[F] = q;
            }
          }
        }
        S.push(n);
      }
      if (!(S.every((U) => U[0] === w[2]) || S.every((U) => U[1] === w[3]))) {
        for (const [U, j, n] of y) {
          if (S.every((q) => (q[U] - j) * n >= 0)) {
            continue;
          }
          const F = [];
          for (let q = 0; q < S.length; q++) {
            const u = S[q];
            const x = S[(q + 1) % S.length];
            const b = (u[U] - j) * n;
            const m = (x[U] - j) * n;
            if ((b >= 0 && F.push(u), b * m < 0)) {
              const L = b / (b - m);
              const p = [];
              for (let Z = 0; Z < u.length; Z++) {
                p.push(u[Z] + (x[Z] - u[Z]) * L);
              }
              p[U] = j;
              F.push(p);
            }
          }
          if (((S = F), S.length < 3)) {
            break;
          }
        }
        for (let U = 1; U < S.length - 1; U++) {
          const j = [S[0], S[U], S[U + 1]];
          const n = j[0];
          const F = j[1];
          const q = j[2];
          const u = F[0] - n[0];
          const x = F[1] - n[1];
          const b = F[2] - n[2];
          const m = q[0] - n[0];
          const L = q[1] - n[1];
          const p = q[2] - n[2];
          if (!(Math.hypot(x * p - b * L, b * m - u * p, u * L - x * m) < 1e-10)) {
            for (const Z of j) {
              for (let V = 0; V < E.length; V++) {
                s[E[V]].push(Z[V * 3], Z[V * 3 + 1], Z[V * 3 + 2]);
              }
            }
          }
        }
      }
    }
    for (const Y of E) {
      s[Y] = new A[Y].constructor(s[Y]);
    }
    return s;
  }
  static clip(A, C) {
    const Q = this.rectangle(A.anchor, C);
    const i = {
      ...A,
      bounds: {
        ...C,
      },
      features: [],
      surfaces: {},
    };
    const E = {
      positions: A.positions,
      colors: A.colors,
      materials: A.materials,
    };
    const s = ['positions', 'colors', 'materials'].filter((Y) => E[Y]);
    const w = [];
    const t = Object.fromEntries(s.map((Y) => [Y, 0]));
    for (const Y of A.features) {
      const N = Y.bounds;
      if (
        N &&
        (N[0] > Q[2] + 1e-8 || N[3] < Q[0] - 1e-8 || N[1] > Q[3] + 1e-8 || N[4] < Q[1] - 1e-8)
      ) {
        continue;
      }
      const a = this.clipMesh(E, Q, Y.startTriangle, Y.triangleCount);
      if (a.positions.length) {
        i.features.push({
          ...Y,
          startTriangle: t.positions / 9,
          triangleCount: a.positions.length / 9,
        });
        w.push(a);
        for (const K of s) {
          t[K] += a[K].length;
        }
      }
    }
    for (const Y of s) {
      i[Y] = new A[Y].constructor(t[Y]);
      let N = 0;
      for (const a of w) {
        i[Y].set(a[Y], N);
        N += a[Y].length;
      }
    }
    i.water = this.clipMesh(
      {
        positions: A.water,
      },
      Q,
    ).positions;
    for (const [Y, N] of Object.entries(A.surfaces)) {
      i.surfaces[Y] = {
        ...N,
        ...this.clipMesh(N, Q),
      };
    }
    for (const Y of ['trees', 'lamps', 'furniture']) {
      i[Y] = A[Y].filter((N) => N.x >= Q[0] && N.x < Q[2] && N.y >= Q[1] && N.y < Q[3]);
    }
    const y = [];
    for (let Y = 0; Y < A.sleepers.length; Y += 4) {
      const N = A.sleepers[Y];
      const a = A.sleepers[Y + 1];
      if (N >= Q[0] && N < Q[2] && a >= Q[1] && a < Q[3]) {
        y.push(N, a, A.sleepers[Y + 2], A.sleepers[Y + 3]);
      }
    }
    i.sleepers = new Float32Array(y);
    for (const Y of ['traffic', 'boats']) {
      i[Y] = A[Y].filter(
        (N) =>
          N.bounds[0] <= Q[2] && N.bounds[2] >= Q[0] && N.bounds[1] <= Q[3] && N.bounds[3] >= Q[1],
      );
    }
    i.railways = [];
    for (const Y of A.railways) {
      let N = [];
      for (let a = 3; a < Y.points.length; a += 3) {
        const K = Y.points.subarray(a - 3, a);
        const e = Y.points.subarray(a, a + 3);
        let G = 0;
        let J = 1;
        for (let S = 0; S < 2; S++) {
          const U = e[S] - K[S];
          if (Math.abs(U) < 1e-9) {
            if (K[S] < Q[S] || K[S] > Q[S + 2]) {
              J = -1;
            }
          } else {
            const j = (Q[S] - K[S]) / U;
            const n = (Q[S + 2] - K[S]) / U;
            G = Math.max(G, Math.min(j, n));
            J = Math.min(J, Math.max(j, n));
          }
        }
        if (J > G) {
          const S = [K[0] + (e[0] - K[0]) * G, K[1] + (e[1] - K[1]) * G, K[2] + (e[2] - K[2]) * G];
          if (N.length && Math.hypot(N.at(-3) - S[0], N.at(-2) - S[1]) > 0.01) {
            i.railways.push({
              ...Y,
              points: new Float32Array(N),
            });
            N = [];
          }
          if (!N.length) {
            N.push(...S);
          }
          N.push(K[0] + (e[0] - K[0]) * J, K[1] + (e[1] - K[1]) * J, K[2] + (e[2] - K[2]) * J);
        }
        if (J < 1 && N.length) {
          i.railways.push({
            ...Y,
            points: new Float32Array(N),
          });
          N = [];
        }
      }
      if (N.length) {
        i.railways.push({
          ...Y,
          points: new Float32Array(N),
        });
      }
    }
    i.treeCount = i.trees.filter((Y) => Y.source === 'node').length;
    if (A.stats) {
      i.stats = {
        ...A.stats,
        buildings: i.features.length,
        parts: i.features.filter((Y) => Y.part).length,
        triangles: i.positions.length / 9,
      };
    }
    if (A.landscapeStats) {
      i.landscapeStats = {
        ...A.landscapeStats,
        mappedTrees: i.treeCount,
        generatedTrees: i.trees.length - i.treeCount,
        lamps: i.lamps.length,
      };
    }
    return i;
  }
}
export { TileClipping };

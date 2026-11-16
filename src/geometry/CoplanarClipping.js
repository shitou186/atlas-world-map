// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class CoplanarClipping {
  static area(A) {
    let C = 0;
    for (let Q = 0; Q < A.length; Q++) {
      const i = A[Q];
      const E = A[(Q + 1) % A.length];
      C += i[0] * E[1] - E[0] * i[1];
    }
    return Math.abs(C) / 2;
  }
  static subtract(A, C) {
    let Q = A;
    const i = [];
    for (let E = 0; E < 3; E++) {
      const s = C[E];
      const w = C[(E + 1) % 3];
      const t = w[0] - s[0];
      const y = w[1] - s[1];
      const Y = [];
      const N = [];
      for (let a = 0; a < Q.length; a++) {
        const K = Q[a];
        const e = Q[(a + 1) % Q.length];
        const G = t * (K[1] - s[1]) - y * (K[0] - s[0]);
        const J = t * (e[1] - s[1]) - y * (e[0] - s[0]);
        if ((G >= 0 && Y.push(K), G <= 0 && N.push(K), G * J < 0)) {
          const S = G / (G - J);
          const U = [K[0] + (e[0] - K[0]) * S, K[1] + (e[1] - K[1]) * S];
          Y.push(U);
          N.push(U);
        }
      }
      if (Y.length < 3 || this.area(Y) < 1e-8) {
        return [A];
      }
      if (N.length >= 3 && this.area(N) > 1e-8) {
        i.push(N);
      }
      Q = Y;
    }
    return i;
  }
  static resolve(A, C, Q, i = null) {
    const E = new Map();
    const s = new Map();
    for (let N = 0; N < Q.length; N++) {
      const a = Q[N];
      for (let K = a.startTriangle * 9; K < (a.startTriangle + a.triangleCount) * 9; K += 9) {
        const e = A.slice(K, K + 3);
        const G = A.slice(K + 3, K + 6);
        const J = A.slice(K + 6, K + 9);
        const S = G[0] - e[0];
        const U = G[1] - e[1];
        const j = G[2] - e[2];
        const n = J[0] - e[0];
        const F = J[1] - e[1];
        const q = J[2] - e[2];
        const u = [U * q - j * F, j * n - S * q, S * F - U * n];
        let x = 0;
        if (Math.abs(u[1]) > Math.abs(u[x])) {
          x = 1;
        }
        if (Math.abs(u[2]) > Math.abs(u[x])) {
          x = 2;
        }
        const b = (x + 1) % 3;
        const m = (x + 2) % 3;
        const L = -u[b] / u[x];
        const p = -u[m] / u[x];
        const Z = e[x] - L * e[b] - p * e[m];
        const V = `${x}/${Math.round(L * 10000000)}/${Math.round(p * 10000000)}/${Math.round(Z * 100000)}`;
        let z = E.get(V);
        if (!z) {
          z = {
            entries: [],
            owners: new Set(),
          };
          E.set(V, z);
        }
        z.entries.push({
          index: K,
          owner: N,
          axis: x,
          first: b,
          second: m,
          slopeA: L,
          slopeB: p,
          offset: Z,
          points: [
            [e[b], e[m]],
            [G[b], G[m]],
            [J[b], J[m]],
          ],
        });
        z.owners.add(N);
      }
    }
    for (const N of E.values()) {
      if (N.owners.size < 2) {
        continue;
      }
      const a = new Map();
      const K = [];
      for (const e of N.entries) {
        const G = e.points;
        const J = [
          Math.min(...G.map((m) => m[0])),
          Math.min(...G.map((m) => m[1])),
          Math.max(...G.map((m) => m[0])),
          Math.max(...G.map((m) => m[1])),
        ];
        const S = Math.floor(J[0] / 32);
        const U = Math.floor(J[1] / 32);
        const j = Math.floor(J[2] / 32);
        const n = Math.floor(J[3] / 32);
        const F = new Set(K);
        const q = (j - S + 1) * (n - U + 1) > 4096;
        if (q) {
          for (const m of a.values()) {
            for (const L of m) {
              F.add(L);
            }
          }
        } else {
          for (let m = S; m <= j; m++) {
            for (let L = U; L <= n; L++) {
              for (const p of a.get(`${m}/${L}`) || []) {
                F.add(p);
              }
            }
          }
        }
        let u = [G];
        for (const m of F) {
          if (
            m.owner === e.owner ||
            m.bounds[0] >= J[2] - 1e-7 ||
            m.bounds[2] <= J[0] + 1e-7 ||
            m.bounds[1] >= J[3] - 1e-7 ||
            m.bounds[3] <= J[1] + 1e-7
          ) {
            continue;
          }
          let L = true;
          for (const Z of G) {
            if (
              Math.abs(
                (e.slopeA - m.slopeA) * Z[0] + (e.slopeB - m.slopeB) * Z[1] + e.offset - m.offset,
              ) > 0.00001
            ) {
              L = false;
            }
          }
          if (!L) {
            continue;
          }
          const p = [];
          for (const Z of u) {
            p.push(...this.subtract(Z, m.points));
          }
          if (((u = p), !u.length)) {
            break;
          }
        }
        if (u.length !== 1 || u[0] !== G) {
          const m = [];
          for (const L of u) {
            for (let p = 1; p < L.length - 1; p++) {
              const Z = [L[0], L[p], L[p + 1]];
              if (!(this.area(Z) < 1e-8)) {
                for (const V of Z) {
                  const z = [0, 0, 0];
                  z[e.first] = V[0];
                  z[e.second] = V[1];
                  z[e.axis] = e.slopeA * V[0] + e.slopeB * V[1] + e.offset;
                  m.push(...z);
                }
              }
            }
          }
          s.set(e.index, m);
        }
        const x =
          (G[1][0] - G[0][0]) * (G[2][1] - G[0][1]) - (G[1][1] - G[0][1]) * (G[2][0] - G[0][0]);
        const b = {
          ...e,
          bounds: J,
          points: x < 0 ? [G[0], G[2], G[1]] : G,
        };
        if (q) {
          K.push(b);
        } else {
          for (let m = S; m <= j; m++) {
            for (let L = U; L <= n; L++) {
              const p = `${m}/${L}`;
              if (!a.has(p)) {
                a.set(p, []);
              }
              a.get(p).push(b);
            }
          }
        }
      }
    }
    if (!s.size) {
      return {
        positions: A,
        colors: C,
        materials: i,
        features: Q,
        clipped: 0,
      };
    }
    const w = [];
    const t = [];
    const y = [];
    const Y = [];
    for (const N of Q) {
      const a = w.length;
      const K = N.startTriangle * 9;
      const e = K + N.triangleCount * 9;
      for (let G = K; G < e; G += 9) {
        const J = s.get(G);
        if (J) {
          for (let S = 0; S < J.length; S++) {
            w.push(J[S]);
            t.push(C[G + (S % 3)]);
            if (i) {
              y.push(i[G + (S % 3)]);
            }
          }
        } else {
          for (let S = G; S < G + 9; S++) {
            w.push(A[S]);
            t.push(C[S]);
            if (i) {
              y.push(i[S]);
            }
          }
        }
      }
      N.startTriangle = a / 9;
      N.triangleCount = (w.length - a) / 9;
      if (N.triangleCount) {
        Y.push(N);
      }
    }
    return {
      positions: w,
      colors: t,
      materials: i ? y : null,
      features: Y,
      clipped: s.size,
    };
  }
}
export { CoplanarClipping };

// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class RailwayRoutes {
  static build(railways) {
    const o = new Map();
    const p = [];
    const x = new Set();
    for (const l of railways) {
      if (!['rail', 'light_rail', 'tram', 'subway', 'narrow_gauge'].includes(l.type)) {
        continue;
      }
      let D = null;
      for (let F = 0; F < l.points.length; F += 3) {
        const U = l.points[F];
        const j = l.points[F + 1];
        const q = l.points[F + 2];
        const N = `${l.type}/${l.gauge}/${Math.round(U * 20)}/${Math.round(j * 20)}/${Math.round(q * 100)}`;
        if (!o.has(N)) {
          o.set(N, {
            key: N,
            x: U,
            y: j,
            z: q,
            edges: [],
          });
        }
        const J = o.get(N);
        if (D && D !== J) {
          const se = D.key < N ? D.key + ':' + N : N + ':' + D.key;
          if (!x.has(se)) {
            const Z = {
              key: se,
              a: D.key < N ? D : J,
              b: D.key < N ? J : D,
              type: l.type,
              gauge: l.gauge,
              used: false,
            };
            p.push(Z);
            D.edges.push(Z);
            J.edges.push(Z);
            x.add(se);
          }
        }
        D = J;
      }
    }
    p.sort((l, D) => l.key.localeCompare(D.key));
    const T = [];
    const w = p.filter((l) => l.a.edges.length !== 2 || l.b.edges.length !== 2);
    for (const l of [...w, ...p]) {
      if (l.used) {
        continue;
      }
      let D = l;
      let F = l.a.edges.length !== 2 ? l.a : l.b;
      const U = [F.x, F.y, F.z];
      const j = [0];
      const q = [F.x, F.y, F.x, F.y];
      const N = F;
      for (; D && !D.used;) {
        D.used = true;
        const Z = D.a === F ? D.b : D.a;
        if (
          (j.push(j.at(-1) + Math.hypot(Z.x - F.x, Z.y - F.y, Z.z - F.z)),
          U.push(Z.x, Z.y, Z.z),
          (q[0] = Math.min(q[0], Z.x)),
          (q[1] = Math.min(q[1], Z.y)),
          (q[2] = Math.max(q[2], Z.x)),
          (q[3] = Math.max(q[3], Z.y)),
          (F = Z),
          F === N || F.edges.length !== 2)
        ) {
          break;
        }
        D = F.edges[0].used ? F.edges[1] : F.edges[0];
      }
      const J = j.at(-1);
      if (J < 70) {
        continue;
      }
      let se = 0;
      for (const Z of N.key) {
        se = (Math.imul(se, 31) + Z.charCodeAt(0)) | 0;
      }
      T.push({
        id: N.key,
        type: l.type,
        points: new Float32Array(U),
        distances: new Float32Array(j),
        bounds: q,
        length: J,
        loop: F === N,
        speed: l.type === 'tram' ? 7 : 13,
        seed: se >>> 0,
        gauge: l.gauge,
        cars: Math.min(4, Math.floor(J / 35)),
      });
    }
    return T;
  }
  static project(route, point) {
    let p = null;
    for (let x = 3; x < route.points.length; x += 3) {
      const T = route.points;
      const w = x - 3;
      const l = T[x] - T[w];
      const D = T[x + 1] - T[w + 1];
      const F = T[x + 2] - T[w + 2];
      const U = l * l + D * D + F * F;
      if (!U) {
        continue;
      }
      const j = Math.max(
        0,
        Math.min(
          1,
          ((point[0] - T[w]) * l + (point[1] - T[w + 1]) * D + (point[2] - T[w + 2]) * F) / U,
        ),
      );
      const q =
        (point[0] - T[w] - l * j) ** 2 +
        (point[1] - T[w + 1] - D * j) ** 2 +
        (point[2] - T[w + 2] - F * j) ** 2;
      if (!p || q < p.error) {
        p = {
          error: q,
          distance: route.distances[w / 3] + Math.sqrt(U) * j,
          angle: Math.atan2(D, l),
        };
      }
    }
    return p;
  }
}
export { RailwayRoutes };

// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class BoatRoutes {
  static build(features, landscape) {
    const Q = [];
    const i = new Set();
    for (const E of features) {
      const s = E.properties || {};
      const w = E.geometry;
      const t = ['ferry', 'boat'].includes(s.route);
      const y =
        s.waterway === 'fairway' ||
        (['river', 'canal'].includes(s.waterway) &&
          ['yes', 'designated', 'permissive'].includes(s.boat));
      if (
        (!t && !y) ||
        ['no', 'private'].includes(s.boat ?? s.access) ||
        s.tunnel === 'yes' ||
        s.tunnel === true ||
        !['LineString', 'MultiLineString'].includes(w?.type)
      ) {
        continue;
      }
      const Y = s.width;
      if (Number.isFinite(Y) && Y < 12) {
        continue;
      }
      const N = w.type === 'LineString' ? [w.coordinates] : w.coordinates;
      for (let a = 0; a < N.length; a++) {
        const K = N[a];
        const e = [];
        const G = [0];
        const J = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
        const S = JSON.stringify(K);
        if (i.has(S)) {
          continue;
        }
        i.add(S);
        for (const n of K) {
          const F = landscape.point(n);
          if (e.length) {
            const q = e.at(-1);
            const u = Math.hypot(F[0] - q[0], F[1] - q[1]);
            if (u < 0.001) {
              continue;
            }
            G.push(G.at(-1) + u);
          }
          e.push([F[0], F[1], 0.03]);
          J[0] = Math.min(J[0], F[0]);
          J[1] = Math.min(J[1], F[1]);
          J[2] = Math.max(J[2], F[0]);
          J[3] = Math.max(J[3], F[1]);
        }
        const U = G.at(-1);
        if (U < 250) {
          continue;
        }
        let j = 0;
        for (const n of E.id) {
          j = (Math.imul(j, 31) + n.charCodeAt(0)) | 0;
        }
        Q.push({
          id: `${E.id}/${a}/${K[0].join(',')}/${K.at(-1).join(',')}`,
          sourceId: E.id,
          points: new Float32Array(e.flat()),
          distances: new Float32Array(G),
          bounds: J,
          length: U,
          seed: j >>> 0,
          speed: 25 / 3,
          count: Math.min(32, Math.max(1, Math.floor(U / 1000))),
          ferry: t,
        });
      }
    }
    return Q;
  }
}
export { BoatRoutes };

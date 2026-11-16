// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class TrafficRoutes {
  static build(roads) {
    const o = [];
    const p = {
      motorway: 55,
      motorway_link: 65,
      trunk: 55,
      trunk_link: 65,
      primary: 45,
      primary_link: 55,
      secondary: 65,
      secondary_link: 70,
      tertiary: 80,
      tertiary_link: 85,
      residential: 140,
      living_street: 180,
      unclassified: 100,
      service: 180,
    };
    for (const x of roads) {
      const T = x.tags;
      if (
        !p[T.highway] ||
        x.path ||
        x.width < 2.7 ||
        T.area === 'yes' ||
        ['yes', 'building_passage'].includes(T.tunnel) ||
        T.covered === 'yes'
      ) {
        continue;
      }
      const w = T.motorcar ?? T.motor_vehicle ?? T.vehicle ?? T.access;
      if (
        ['no', 'private', 'agricultural', 'forestry', 'delivery'].includes(w) ||
        ['parking_aisle', 'driveway', 'emergency_access'].includes(T.service) ||
        ['reversible', 'alternating'].includes(T.oneway)
      ) {
        continue;
      }
      let l = 0;
      for (const N of x.id) {
        l = (Math.imul(l, 31) + N.charCodeAt(0)) | 0;
      }
      const D =
        T.oneway === '-1'
          ? -1
          : ['yes', '1', 'true'].includes(T.oneway) ||
              (T.oneway !== 'no' && (T.junction === 'roundabout' || T.highway === 'motorway'))
            ? 1
            : 0;
      if (!D && x.width < 5) {
        continue;
      }
      const F = D ? [D] : [1, -1];
      const U = T.driving_side === 'left';
      const j = /^\d+(?:\.\d+)?(?:\s*mph)?$/.test(T.maxspeed || '')
        ? Number.parseFloat(T.maxspeed) * (/mph$/.test(T.maxspeed) ? 1.609344 : 1)
        : 0;
      const q =
        Math.min(
          80,
          Math.max(
            8,
            j ||
              (T.highway.startsWith('motorway')
                ? 70
                : T.highway === 'service'
                  ? 15
                  : T.highway === 'residential'
                    ? 25
                    : 40),
          ),
        ) / 3.6;
      for (const N of F) {
        const J = [];
        const se = x.width / Math.max(x.lanes || (D ? 1 : 2), D ? 1 : 2);
        const Z = D && x.lanes <= 1 ? 0 : (U ? 1 : -1) * N * Math.max(0, x.width / 2 - se / 2);
        for (let ce = 0; ce < x.points.length; ce++) {
          const pe = x.points[ce];
          const de = x.points[Math.max(0, ce - 1)];
          const B = x.points[Math.min(x.points.length - 1, ce + 1)];
          const ie = Math.hypot(pe[0] - de[0], pe[1] - de[1]);
          const Y = Math.hypot(B[0] - pe[0], B[1] - pe[1]);
          const K = ie ? -(pe[1] - de[1]) / ie : -(B[1] - pe[1]) / Y;
          const ae = ie ? (pe[0] - de[0]) / ie : (B[0] - pe[0]) / Y;
          const we = Y ? -(B[1] - pe[1]) / Y : K;
          const Re = Y ? (B[0] - pe[0]) / Y : ae;
          const Se = Math.max(0.5, 1 + K * we + ae * Re);
          J.push([
            pe[0] + ((K + we) / Se) * Z,
            pe[1] + ((ae + Re) / Se) * Z,
            (pe[2] ?? x.z) + 0.025,
          ]);
        }
        if (N < 0) {
          J.reverse();
        }
        const G = new Float32Array(J.length);
        const re = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
        for (let ce = 0; ce < J.length; ce++) {
          const pe = J[ce];
          re[0] = Math.min(re[0], pe[0]);
          re[1] = Math.min(re[1], pe[1]);
          re[2] = Math.max(re[2], pe[0]);
          re[3] = Math.max(re[3], pe[1]);
          if (ce) {
            G[ce] = G[ce - 1] + Math.hypot(pe[0] - J[ce - 1][0], pe[1] - J[ce - 1][1]);
          }
        }
        const ue = G.at(-1);
        if (!(ue < 24)) {
          o.push({
            id: `${x.id}/${N}`,
            points: new Float32Array(J.flat()),
            distances: G,
            length: ue,
            speed: q,
            seed: (l + N * 97) >>> 0,
            count: Math.min(64, Math.max(1, Math.floor(ue / p[T.highway]))),
            bounds: re,
          });
        }
      }
    }
    return o;
  }
  static sample(route, distance, output) {
    let x = 0;
    let T = route.distances.length - 1;
    for (; T - x > 1;) {
      const F = (x + T) >>> 1;
      if (route.distances[F] <= distance) {
        x = F;
      } else {
        T = F;
      }
    }
    const w = x * 3;
    const l = T * 3;
    const D = Math.max(
      0,
      Math.min(1, (distance - route.distances[x]) / (route.distances[T] - route.distances[x])),
    );
    output[0] = route.points[w] + (route.points[l] - route.points[w]) * D;
    output[1] = route.points[w + 1] + (route.points[l + 1] - route.points[w + 1]) * D;
    output[2] = route.points[w + 2] + (route.points[l + 2] - route.points[w + 2]) * D;
    output[3] = Math.atan2(
      route.points[l + 1] - route.points[w + 1],
      route.points[l] - route.points[w],
    );
  }
}
export { TrafficRoutes };

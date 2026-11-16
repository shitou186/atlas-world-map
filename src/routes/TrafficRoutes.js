// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class TrafficRoutes {
  static build(roads) {
    // 根据道路通行限制、单行方向和驾驶侧，生成可供车辆行驶的车道路线。
    const routes = [];
    const spacingByHighway = {
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
    for (const road of roads) {
      const tags = road.tags;
      if (
        !spacingByHighway[tags.highway] ||
        road.path ||
        road.width < 2.7 ||
        tags.area === 'yes' ||
        ['yes', 'building_passage'].includes(tags.tunnel) ||
        tags.covered === 'yes'
      ) {
        continue;
      }
      const access = tags.motorcar ?? tags.motor_vehicle ?? tags.vehicle ?? tags.access;
      if (
        ['no', 'private', 'agricultural', 'forestry', 'delivery'].includes(access) ||
        ['parking_aisle', 'driveway', 'emergency_access'].includes(tags.service) ||
        ['reversible', 'alternating'].includes(tags.oneway)
      ) {
        continue;
      }
      let seed = 0;
      for (const idCharacter of road.id) {
        seed = (Math.imul(seed, 31) + idCharacter.charCodeAt(0)) | 0;
      }
      const onewayDirection =
        tags.oneway === '-1'
          ? -1
          : ['yes', '1', 'true'].includes(tags.oneway) ||
              (tags.oneway !== 'no' &&
                (tags.junction === 'roundabout' || tags.highway === 'motorway'))
            ? 1
            : 0;
      if (!onewayDirection && road.width < 5) {
        continue;
      }
      const directions = onewayDirection ? [onewayDirection] : [1, -1];
      const drivesOnLeft = tags.driving_side === 'left';
      const maxSpeedKph = /^\d+(?:\.\d+)?(?:\s*mph)?$/.test(tags.maxspeed || '')
        ? Number.parseFloat(tags.maxspeed) * (/mph$/.test(tags.maxspeed) ? 1.609344 : 1)
        : 0;
      const speed =
        Math.min(
          80,
          Math.max(
            8,
            maxSpeedKph ||
              (tags.highway.startsWith('motorway')
                ? 70
                : tags.highway === 'service'
                  ? 15
                  : tags.highway === 'residential'
                    ? 25
                    : 40),
          ),
        ) / 3.6;
      for (const direction of directions) {
        const points = [];
        const laneWidth =
          road.width / Math.max(road.lanes || (onewayDirection ? 1 : 2), onewayDirection ? 1 : 2);
        const laneOffset =
          onewayDirection && road.lanes <= 1
            ? 0
            : (drivesOnLeft ? 1 : -1) * direction * Math.max(0, road.width / 2 - laneWidth / 2);
        for (let pointIndex = 0; pointIndex < road.points.length; pointIndex++) {
          const point = road.points[pointIndex];
          const previousPoint = road.points[Math.max(0, pointIndex - 1)];
          const nextPoint = road.points[Math.min(road.points.length - 1, pointIndex + 1)];
          const previousLength = Math.hypot(
            point[0] - previousPoint[0],
            point[1] - previousPoint[1],
          );
          const nextLength = Math.hypot(nextPoint[0] - point[0], nextPoint[1] - point[1]);
          const previousNormalX = previousLength
            ? -(point[1] - previousPoint[1]) / previousLength
            : -(nextPoint[1] - point[1]) / nextLength;
          const previousNormalY = previousLength
            ? (point[0] - previousPoint[0]) / previousLength
            : (nextPoint[0] - point[0]) / nextLength;
          const nextNormalX = nextLength
            ? -(nextPoint[1] - point[1]) / nextLength
            : previousNormalX;
          const nextNormalY = nextLength ? (nextPoint[0] - point[0]) / nextLength : previousNormalY;
          // 相邻线段的法线合成斜接偏移，保持弯道处的车道连续。
          const miterDenominator = Math.max(
            0.5,
            1 + previousNormalX * nextNormalX + previousNormalY * nextNormalY,
          );
          points.push([
            point[0] + ((previousNormalX + nextNormalX) / miterDenominator) * laneOffset,
            point[1] + ((previousNormalY + nextNormalY) / miterDenominator) * laneOffset,
            (point[2] ?? road.z) + 0.025,
          ]);
        }
        if (direction < 0) {
          points.reverse();
        }
        const distances = new Float32Array(points.length);
        const bounds = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
        for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
          const point = points[pointIndex];
          bounds[0] = Math.min(bounds[0], point[0]);
          bounds[1] = Math.min(bounds[1], point[1]);
          bounds[2] = Math.max(bounds[2], point[0]);
          bounds[3] = Math.max(bounds[3], point[1]);
          if (pointIndex) {
            distances[pointIndex] =
              distances[pointIndex - 1] +
              Math.hypot(
                point[0] - points[pointIndex - 1][0],
                point[1] - points[pointIndex - 1][1],
              );
          }
        }
        const routeLength = distances.at(-1);
        if (!(routeLength < 24)) {
          routes.push({
            id: `${road.id}/${direction}`,
            points: new Float32Array(points.flat()),
            distances: distances,
            length: routeLength,
            speed: speed,
            seed: (seed + direction * 97) >>> 0,
            count: Math.min(
              64,
              Math.max(1, Math.floor(routeLength / spacingByHighway[tags.highway])),
            ),
            bounds: bounds,
          });
        }
      }
    }
    return routes;
  }
  static sample(route, distance, output) {
    // 在累计距离中二分定位线段，再插值得到位置与航向；调用方复用输出数组。
    let lowerIndex = 0;
    let upperIndex = route.distances.length - 1;
    for (; upperIndex - lowerIndex > 1;) {
      const middleIndex = (lowerIndex + upperIndex) >>> 1;
      if (route.distances[middleIndex] <= distance) {
        lowerIndex = middleIndex;
      } else {
        upperIndex = middleIndex;
      }
    }
    const lowerOffset = lowerIndex * 3;
    const upperOffset = upperIndex * 3;
    const fraction = Math.max(
      0,
      Math.min(
        1,
        (distance - route.distances[lowerIndex]) /
          (route.distances[upperIndex] - route.distances[lowerIndex]),
      ),
    );
    output[0] =
      route.points[lowerOffset] +
      (route.points[upperOffset] - route.points[lowerOffset]) * fraction;
    output[1] =
      route.points[lowerOffset + 1] +
      (route.points[upperOffset + 1] - route.points[lowerOffset + 1]) * fraction;
    output[2] =
      route.points[lowerOffset + 2] +
      (route.points[upperOffset + 2] - route.points[lowerOffset + 2]) * fraction;
    output[3] = Math.atan2(
      route.points[upperOffset + 1] - route.points[lowerOffset + 1],
      route.points[upperOffset] - route.points[lowerOffset],
    );
  }
}
export { TrafficRoutes };

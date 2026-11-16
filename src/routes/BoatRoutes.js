// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class BoatRoutes {
  static build(features, landscape) {
    // 仅采用允许通航的水路线；坐标去重后累计弧长，供船只按距离匀速采样。
    const routes = [];
    const seenCoordinates = new Set();
    for (const feature of features) {
      const tags = feature.properties || {};
      const geometry = feature.geometry;
      const isFerry = ['ferry', 'boat'].includes(tags.route);
      const isNavigableWaterway =
        tags.waterway === 'fairway' ||
        (['river', 'canal'].includes(tags.waterway) &&
          ['yes', 'designated', 'permissive'].includes(tags.boat));
      if (
        (!isFerry && !isNavigableWaterway) ||
        ['no', 'private'].includes(tags.boat ?? tags.access) ||
        tags.tunnel === 'yes' ||
        tags.tunnel === true ||
        !['LineString', 'MultiLineString'].includes(geometry?.type)
      ) {
        continue;
      }
      const width = tags.width;
      if (Number.isFinite(width) && width < 12) {
        continue;
      }
      const lineStrings =
        geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
      for (let lineIndex = 0; lineIndex < lineStrings.length; lineIndex++) {
        const coordinates = lineStrings[lineIndex];
        const points = [];
        const distances = [0];
        const bounds = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
        const coordinateKey = JSON.stringify(coordinates);
        if (seenCoordinates.has(coordinateKey)) {
          continue;
        }
        seenCoordinates.add(coordinateKey);
        for (const coordinate of coordinates) {
          const projectedPoint = landscape.point(coordinate);
          if (points.length) {
            const previousPoint = points.at(-1);
            const segmentLength = Math.hypot(
              projectedPoint[0] - previousPoint[0],
              projectedPoint[1] - previousPoint[1],
            );
            if (segmentLength < 0.001) {
              continue;
            }
            distances.push(distances.at(-1) + segmentLength);
          }
          points.push([projectedPoint[0], projectedPoint[1], 0.03]);
          bounds[0] = Math.min(bounds[0], projectedPoint[0]);
          bounds[1] = Math.min(bounds[1], projectedPoint[1]);
          bounds[2] = Math.max(bounds[2], projectedPoint[0]);
          bounds[3] = Math.max(bounds[3], projectedPoint[1]);
        }
        const routeLength = distances.at(-1);
        if (routeLength < 250) {
          continue;
        }
        // 使用要素 ID 生成稳定种子，瓦片重新加载后仍保持船只分布。
        let seed = 0;
        for (const idCharacter of feature.id) {
          seed = (Math.imul(seed, 31) + idCharacter.charCodeAt(0)) | 0;
        }
        routes.push({
          id: `${feature.id}/${lineIndex}/${coordinates[0].join(',')}/${coordinates.at(-1).join(',')}`,
          sourceId: feature.id,
          points: new Float32Array(points.flat()),
          distances: new Float32Array(distances),
          bounds: bounds,
          length: routeLength,
          seed: seed >>> 0,
          speed: 25 / 3,
          count: Math.min(32, Math.max(1, Math.floor(routeLength / 1000))),
          ferry: isFerry,
        });
      }
    }
    return routes;
  }
}
export { BoatRoutes };

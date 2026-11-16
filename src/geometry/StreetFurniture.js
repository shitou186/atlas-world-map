// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { Color } from 'three';
import ClipperLib from 'clipper-lib';
class StreetFurniture {
  constructor(landscape) {
    this.landscape = landscape;
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
  triangles(vertices, bufferName, color) {
    const buffer = (this.landscape.buffers[bufferName] ||= {
      positions: [],
      colors: [],
    });
    if (!this.colors.has(color)) {
      this.colors.set(color, new Color(color).toArray());
    }
    const rgb = this.colors.get(color);
    for (const vertex of vertices) {
      buffer.positions.push(...vertex);
      buffer.colors.push(...rgb);
    }
  }
  beam(start, end, width, height, color, bufferName = 'structures') {
    const segmentLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (segmentLength < 0.001) {
      return;
    }
    const offsetX = ((-(end[1] - start[1]) / segmentLength) * width) / 2;
    const offsetY = (((end[0] - start[0]) / segmentLength) * width) / 2;
    const vertices = [
      [start[0] + offsetX, start[1] + offsetY, start[2]],
      [start[0] - offsetX, start[1] - offsetY, start[2]],
      [end[0] - offsetX, end[1] - offsetY, end[2]],
      [end[0] + offsetX, end[1] + offsetY, end[2]],
    ];
    for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
      vertices.push([
        vertices[cornerIndex][0],
        vertices[cornerIndex][1],
        vertices[cornerIndex][2] + height,
      ]);
    }
    const indices = [
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3,
      0, 4, 3, 4, 7,
    ];
    this.triangles(
      indices.map((vertexIndex) => vertices[vertexIndex]),
      bufferName,
      color,
    );
  }
  rectangle(ring) {
    // 单调链先求凸包，再逐边投影寻找最小面积包围矩形，为球场和停机坪确定朝向。
    const sortedPoints = ring
      .slice(0, -1)
      .sort(
        (leftPoint, rightPoint) => leftPoint[0] - rightPoint[0] || leftPoint[1] - rightPoint[1],
      );
    const hull = [];
    for (const chain of [sortedPoints, [...sortedPoints].reverse()]) {
      const chainStart = hull.length;
      for (const point of chain) {
        for (; hull.length >= chainStart + 2;) {
          const previousPoint = hull.at(-2);
          const lastPoint = hull.at(-1);
          if (
            (lastPoint[0] - previousPoint[0]) * (point[1] - previousPoint[1]) -
              (lastPoint[1] - previousPoint[1]) * (point[0] - previousPoint[0]) >
            0
          ) {
            break;
          }
          hull.pop();
        }
        hull.push(point);
      }
      hull.pop();
    }
    let bestRectangle = null;
    for (let edgeIndex = 0; edgeIndex < hull.length; edgeIndex++) {
      const edgeStart = hull[edgeIndex];
      const edgeEnd = hull[(edgeIndex + 1) % hull.length];
      const edgeLength = Math.hypot(edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1]);
      if (!edgeLength) {
        continue;
      }
      const directionX = (edgeEnd[0] - edgeStart[0]) / edgeLength;
      const directionY = (edgeEnd[1] - edgeStart[1]) / edgeLength;
      let minAlong = 1 / 0;
      let maxAlong = -1 / 0;
      let minAcross = 1 / 0;
      let maxAcross = -1 / 0;
      for (const point of hull) {
        const along = point[0] * directionX + point[1] * directionY;
        const across = -point[0] * directionY + point[1] * directionX;
        minAlong = Math.min(minAlong, along);
        maxAlong = Math.max(maxAlong, along);
        minAcross = Math.min(minAcross, across);
        maxAcross = Math.max(maxAcross, across);
      }
      const area = (maxAlong - minAlong) * (maxAcross - minAcross);
      if (!(bestRectangle && bestRectangle.area <= area)) {
        bestRectangle = {
          area: area,
          center: [
            ((minAlong + maxAlong) / 2) * directionX - ((minAcross + maxAcross) / 2) * directionY,
            ((minAlong + maxAlong) / 2) * directionY + ((minAcross + maxAcross) / 2) * directionX,
          ],
          length: maxAlong - minAlong,
          width: maxAcross - minAcross,
          angle: Math.atan2(directionY, directionX),
        };
      }
    }
    if (bestRectangle && bestRectangle.width > bestRectangle.length) {
      [bestRectangle.width, bestRectangle.length] = [bestRectangle.length, bestRectangle.width];
      bestRectangle.angle += Math.PI / 2;
    }
    return bestRectangle;
  }
  pitch(polygon, sport, height = 0) {
    const landscape = this.landscape;
    const rectangle = this.rectangle(polygon[0]);
    if (!rectangle || rectangle.width < 3 || rectangle.length < 6) {
      return [];
    }
    // 在场地局部坐标生成标准标线，再旋转回场景坐标并裁剪到原多边形。
    const markingPaths = [];
    const length = rectangle.length - 0.4;
    const width = rectangle.width - 0.4;
    if (sport === 'soccer' || sport === 'football') {
      markingPaths.push(
        [
          [-length / 2, -width / 2],
          [length / 2, -width / 2],
          [length / 2, width / 2],
          [-length / 2, width / 2],
          [-length / 2, -width / 2],
        ],
        [
          [0, -width / 2],
          [0, width / 2],
        ],
      );
      const fieldScale = Math.min(1, length / 90, width / 45);
      const centerCircle = [];
      for (let angleIndex = 0; angleIndex <= 64; angleIndex++) {
        centerCircle.push([
          Math.cos((angleIndex * Math.PI) / 32) * 9.15 * fieldScale,
          Math.sin((angleIndex * Math.PI) / 32) * 9.15 * fieldScale,
        ]);
      }
      markingPaths.push(centerCircle);
      for (const endSign of [-1, 1]) {
        for (const [boxDepth, boxWidth] of [
          [16.5, 40.32],
          [5.5, 18.32],
        ]) {
          markingPaths.push([
            [(endSign * length) / 2, (-boxWidth * fieldScale) / 2],
            [endSign * (length / 2 - boxDepth * fieldScale), (-boxWidth * fieldScale) / 2],
            [endSign * (length / 2 - boxDepth * fieldScale), (boxWidth * fieldScale) / 2],
            [(endSign * length) / 2, (boxWidth * fieldScale) / 2],
          ]);
        }
      }
    } else if (sport === 'tennis') {
      markingPaths.push([
        [-length / 2, -width / 2],
        [length / 2, -width / 2],
        [length / 2, width / 2],
        [-length / 2, width / 2],
        [-length / 2, -width / 2],
      ]);
      for (const sideSign of [-1, 1]) {
        markingPaths.push([
          [-length / 2, (sideSign * width * 8.23) / 10.97 / 2],
          [length / 2, (sideSign * width * 8.23) / 10.97 / 2],
        ]);
        markingPaths.push([
          [(sideSign * length * 6.4) / 23.77, (-width * 8.23) / 10.97 / 2],
          [(sideSign * length * 6.4) / 23.77, (width * 8.23) / 10.97 / 2],
        ]);
      }
      markingPaths.push([
        [(-length * 6.4) / 23.77, 0],
        [(length * 6.4) / 23.77, 0],
      ]);
      const netOffsetX = (-Math.sin(rectangle.angle) * width) / 2;
      const netOffsetY = (Math.cos(rectangle.angle) * width) / 2;
      const netStart = [
        rectangle.center[0] - netOffsetX,
        rectangle.center[1] - netOffsetY,
        height + 0.1,
      ];
      const netEnd = [
        rectangle.center[0] + netOffsetX,
        rectangle.center[1] + netOffsetY,
        height + 0.1,
      ];
      this.triangles(
        [
          netStart,
          netEnd,
          [netEnd[0], netEnd[1], height + 1.05],
          netStart,
          [netEnd[0], netEnd[1], height + 1.05],
          [netStart[0], netStart[1], height + 1.05],
        ],
        'fenceMesh',
        '#6d746b',
      );
      this.beam(
        [netStart[0], netStart[1], height + 1.05],
        [netEnd[0], netEnd[1], height + 1.05],
        0.035,
        0.035,
        '#eee9dc',
      );
      for (const post of [netStart, netEnd]) {
        this.beam(
          [post[0] - 0.035, post[1], height + 0.05],
          [post[0] + 0.035, post[1], height + 0.05],
          0.07,
          1.07,
          '#596866',
        );
      }
    } else if (sport === 'basketball' || sport === 'volleyball') {
      if (
        (markingPaths.push(
          [
            [-length / 2, -width / 2],
            [length / 2, -width / 2],
            [length / 2, width / 2],
            [-length / 2, width / 2],
            [-length / 2, -width / 2],
          ],
          [
            [0, -width / 2],
            [0, width / 2],
          ],
        ),
        sport === 'basketball')
      ) {
        const courtScale = Math.min(length / 28, width / 15);
        const centerCircle = [];
        for (let angleIndex = 0; angleIndex <= 48; angleIndex++) {
          centerCircle.push([
            Math.cos((angleIndex * Math.PI) / 24) * 1.8 * courtScale,
            Math.sin((angleIndex * Math.PI) / 24) * 1.8 * courtScale,
          ]);
        }
        markingPaths.push(centerCircle);
        for (const endSign of [-1, 1]) {
          markingPaths.push([
            [(endSign * length) / 2, -2.45 * courtScale],
            [endSign * (length / 2 - 5.8 * courtScale), -2.45 * courtScale],
            [endSign * (length / 2 - 5.8 * courtScale), 2.45 * courtScale],
            [(endSign * length) / 2, 2.45 * courtScale],
          ]);
          const threePointArc = [];
          for (let arcIndex = 0; arcIndex <= 48; arcIndex++) {
            const angle = -Math.PI / 2 + (arcIndex * Math.PI) / 48;
            threePointArc.push([
              endSign * (length / 2 - 1.575 * courtScale - Math.cos(angle) * 6.75 * courtScale),
              Math.sin(angle) * 6.75 * courtScale,
            ]);
          }
          markingPaths.push(threePointArc);
        }
      } else {
        for (const sideSign of [-1, 1]) {
          markingPaths.push([
            [(sideSign * length) / 6, -width / 2],
            [(sideSign * length) / 6, width / 2],
          ]);
        }
      }
    } else {
      return [];
    }
    const markingPolygons = [];
    for (const path of markingPaths) {
      markingPolygons.push(
        landscape.ribbon(
          path.map((point) => [
            rectangle.center[0] +
              point[0] * Math.cos(rectangle.angle) -
              point[1] * Math.sin(rectangle.angle),
            rectangle.center[1] +
              point[0] * Math.sin(rectangle.angle) +
              point[1] * Math.cos(rectangle.angle),
          ]),
          0.07,
        ),
      );
    }
    return landscape.combine(markingPolygons, [polygon], ClipperLib.ClipType.ctIntersection);
  }
  build(features) {
    const landscape = this.landscape;
    const seenFeatures = new Set();
    for (const feature of features) {
      const featureKey = `${feature.id}/${JSON.stringify(feature.geometry)}/${JSON.stringify(feature.properties)}`;
      if (seenFeatures.has(featureKey)) {
        continue;
      }
      seenFeatures.add(featureKey);
      const properties = feature.properties;
      const geometry = feature.geometry;
      if (
        geometry.type === 'Point' &&
        (properties.highway === 'bus_stop' ||
          ['bench', 'fountain'].includes(properties.amenity) ||
          properties.tourism === 'artwork' ||
          properties.historic === 'memorial')
      ) {
        const position = landscape.point(geometry.coordinates);
        const kind =
          properties.highway === 'bus_stop' ? 'busStop' : properties.amenity || 'sculpture';
        let angle = Number.isFinite(properties.direction)
          ? Math.PI / 2 - (properties.direction * Math.PI) / 180
          : 0;
        let nearestDistance = 30;
        // 未提供朝向时，在 30 米内搜索最近道路投影点，使街具面向道路。
        if (!Number.isFinite(properties.direction)) {
          for (const road of landscape.roads) {
            for (let segmentIndex = 1; segmentIndex < road.points.length; segmentIndex++) {
              const segmentStart = road.points[segmentIndex - 1];
              const segmentEnd = road.points[segmentIndex];
              const deltaX = segmentEnd[0] - segmentStart[0];
              const deltaY = segmentEnd[1] - segmentStart[1];
              const closestRatio = Math.max(
                0,
                Math.min(
                  1,
                  ((position[0] - segmentStart[0]) * deltaX +
                    (position[1] - segmentStart[1]) * deltaY) /
                    (deltaX * deltaX + deltaY * deltaY),
                ),
              );
              const offsetX = segmentStart[0] + deltaX * closestRatio - position[0];
              const offsetY = segmentStart[1] + deltaY * closestRatio - position[1];
              const distance = Math.hypot(offsetX, offsetY);
              if (distance < nearestDistance) {
                nearestDistance = distance;
                angle = Math.atan2(offsetY, offsetX) - Math.PI / 2;
              }
            }
          }
        }
        this.furniture.push({
          id: feature.id,
          kind: kind,
          x: position[0],
          y: position[1],
          z: 0.24,
          angle: angle,
        });
        this.counts[
          kind === 'busStop'
            ? 'busStops'
            : kind === 'bench'
              ? 'benches'
              : kind === 'sculpture'
                ? 'sculptures'
                : 'fountains'
        ]++;
      }
      if (geometry.type === 'LineString' && (properties.barrier || properties.railway)) {
        const points = geometry.coordinates
          .map((coordinate) => landscape.point(coordinate))
          .filter(
            (point, pointIndex, allPoints) =>
              !pointIndex ||
              Math.hypot(
                point[0] - allPoints[pointIndex - 1][0],
                point[1] - allPoints[pointIndex - 1][1],
              ) > 0.001,
          );
        if (points.length < 2) {
          continue;
        }
        if (properties.barrier === 'wall') {
          const wallHeight = properties.height > 0 ? properties.height : 1.6;
          const wallWidth = properties.width > 0 ? properties.width : 0.3;
          landscape.surface(
            [landscape.ribbon(points, wallWidth)],
            'structures',
            wallHeight,
            properties.wall === 'brick' ? '#a9937c' : '#b6b2a5',
            wallHeight,
          );
          landscape.surface(
            [landscape.ribbon(points, wallWidth + 0.06)],
            'structures',
            wallHeight + 0.08,
            '#ccc8ba',
            0.08,
          );
          this.counts.walls++;
        }
        if (properties.barrier === 'fence') {
          const fenceHeight = properties.height > 0 ? properties.height : 1.25;
          const fenceType = properties.fence_type || 'railing';
          // 跨折线段保留剩余间距，保证围栏立柱不会在每个节点重新排布。
          let postDistance = 0;
          for (let segmentIndex = 1; segmentIndex < points.length; segmentIndex++) {
            const segmentStart = points[segmentIndex - 1];
            const segmentEnd = points[segmentIndex];
            const segmentLength = Math.hypot(
              segmentEnd[0] - segmentStart[0],
              segmentEnd[1] - segmentStart[1],
            );
            for (const beamHeight of [0.35, fenceHeight - 0.08]) {
              this.beam(
                [...segmentStart, beamHeight],
                [...segmentEnd, beamHeight],
                0.045,
                0.05,
                '#737b73',
              );
            }
            const postSpacing =
              fenceType === 'railing' || fenceType === 'metal'
                ? 0.16
                : fenceType === 'wood'
                  ? 0.14
                  : 2.5;
            for (; postDistance < segmentLength; postDistance += postSpacing) {
              const postX =
                segmentStart[0] +
                ((segmentEnd[0] - segmentStart[0]) * postDistance) / segmentLength;
              const postY =
                segmentStart[1] +
                ((segmentEnd[1] - segmentStart[1]) * postDistance) / segmentLength;
              this.beam(
                [postX - 0.018, postY, 0.05],
                [postX + 0.018, postY, 0.05],
                fenceType === 'wood' ? 0.1 : 0.036,
                fenceHeight,
                fenceType === 'wood' ? '#a2906d' : '#737b73',
              );
            }
            postDistance -= segmentLength;
            if (['chain_link', 'wire', 'wire_mesh'].includes(fenceType)) {
              this.triangles(
                [
                  [...segmentStart, 0.15],
                  [...segmentEnd, 0.15],
                  [...segmentEnd, fenceHeight],
                  [...segmentStart, 0.15],
                  [...segmentEnd, fenceHeight],
                  [...segmentStart, fenceHeight],
                ],
                'fenceMesh',
                '#8c9790',
              );
            }
          }
          this.counts.fences++;
        }
        if (
          properties.railway &&
          !['abandoned', 'razed', 'proposed', 'construction'].includes(properties.railway)
        ) {
          const gauge = properties.gauge > 0 ? properties.gauge / 1000 : 1.435;
          const isTram = properties.railway === 'tram';
          this.railways.push({
            id: feature.id,
            type: properties.railway,
            gauge: gauge,
            points: new Float32Array(
              points.flatMap((point) => [point[0], point[1], isTram ? 0.103 : 0.33]),
            ),
          });
          if (!isTram) {
            landscape.topology.add(
              [landscape.ribbon(points, gauge + 1.3)],
              'ballast',
              0.08,
              '#a49f93',
              feature,
              4,
              'linear',
            );
          }
          // 轨枕沿整条线路累计间距，两根钢轨则沿每段法线按轨距偏移。
          let sleeperDistance = 0;
          for (let segmentIndex = 1; segmentIndex < points.length; segmentIndex++) {
            const segmentStart = points[segmentIndex - 1];
            const segmentEnd = points[segmentIndex];
            const segmentLength = Math.hypot(
              segmentEnd[0] - segmentStart[0],
              segmentEnd[1] - segmentStart[1],
            );
            const normalX = -(segmentEnd[1] - segmentStart[1]) / segmentLength;
            const normalY = (segmentEnd[0] - segmentStart[0]) / segmentLength;
            if (!isTram) {
              for (; sleeperDistance < segmentLength; sleeperDistance += 0.65) {
                const sleeperX =
                  segmentStart[0] +
                  ((segmentEnd[0] - segmentStart[0]) * sleeperDistance) / segmentLength;
                const sleeperY =
                  segmentStart[1] +
                  ((segmentEnd[1] - segmentStart[1]) * sleeperDistance) / segmentLength;
                this.sleepers.push(sleeperX, sleeperY, Math.atan2(normalY, normalX), gauge + 0.6);
              }
            }
            if (!isTram) {
              sleeperDistance -= segmentLength;
            }
            for (const railSide of [-1, 1]) {
              const railOffset = ((gauge + 0.07) / 2) * railSide;
              const railHeight = isTram ? 0.078 : 0.18;
              const railStart = [
                segmentStart[0] + normalX * railOffset,
                segmentStart[1] + normalY * railOffset,
                railHeight,
              ];
              const railEnd = [
                segmentEnd[0] + normalX * railOffset,
                segmentEnd[1] + normalY * railOffset,
                railHeight,
              ];
              if (!isTram) {
                this.beam(railStart, railEnd, 0.14, 0.025, '#777d7e');
                this.beam(
                  [railStart[0], railStart[1], railHeight + 0.025],
                  [railEnd[0], railEnd[1], railHeight + 0.025],
                  0.025,
                  0.1,
                  '#777d7e',
                );
              }
              this.beam(
                [railStart[0], railStart[1], railHeight + (isTram ? 0 : 0.125)],
                [railEnd[0], railEnd[1], railHeight + (isTram ? 0 : 0.125)],
                0.07,
                0.025,
                '#a8afb0',
              );
            }
          }
          this.counts.railways++;
        }
      }
      if (
        ['Polygon', 'MultiPolygon'].includes(geometry.type) &&
        ['pitch', 'track'].includes(properties.leisure)
      ) {
        const polygons = landscape.projection.project(geometry);
        const color =
          properties.leisure === 'track' || properties.surface === 'clay'
            ? '#b77a61'
            : properties.sport === 'basketball'
              ? '#87a49a'
              : '#9aa876';
        const surfaceRecord = landscape.topology.add(
          polygons,
          'sport',
          0.045,
          color,
          feature,
          properties.leisure === 'pitch' ? 70 : 50,
        );
        for (const polygon of polygons) {
          if (
            (landscape.block(polygon),
            properties.leisure === 'pitch' &&
              surfaceRecord.markings.push(
                ...this.pitch(polygon, properties.sport, surfaceRecord.height - 0.045),
              ),
            properties.leisure === 'track' && properties.sport === 'running')
          ) {
            const clipperPath = polygon[0].map((point) => ({
              X: Math.round(point[0] * 1000),
              Y: Math.round(point[1] * 1000),
            }));
            // 偏移前统一外环绕序，逐道向内收缩后恢复米制坐标生成跑道标线。
            if (!ClipperLib.Clipper.Orientation(clipperPath)) {
              clipperPath.reverse();
            }
            const offsetter = new ClipperLib.ClipperOffset(2, 10);
            const markingPolygons = [];
            offsetter.AddPath(
              clipperPath,
              ClipperLib.JoinType.jtRound,
              ClipperLib.EndType.etClosedPolygon,
            );
            for (
              let laneIndex = 0;
              laneIndex <= (properties.lanes > 0 ? properties.lanes : 8);
              laneIndex++
            ) {
              const offsetPaths = [];
              offsetter.Execute(offsetPaths, -(0.12 + laneIndex * 1.22) * 1000);
              for (const offsetPath of offsetPaths) {
                const ring = offsetPath.map((point) => [point.X / 1000, point.Y / 1000]);
                if (!(ring.length < 3)) {
                  ring.push(ring[0]);
                  markingPolygons.push(landscape.ribbon(ring, 0.05));
                }
              }
            }
            surfaceRecord.markings.push(
              ...landscape.combine(markingPolygons, [polygon], ClipperLib.ClipType.ctIntersection),
            );
          }
        }
        this.counts[properties.leisure === 'pitch' ? 'pitches' : 'tracks']++;
      }
      if (
        ['Polygon', 'MultiPolygon'].includes(geometry.type) &&
        (['construction', 'brownfield', 'farmland'].includes(properties.landuse) ||
          properties.leisure === 'playground' ||
          properties.aeroway === 'helipad')
      ) {
        const polygons = landscape.projection.project(geometry);
        const color =
          properties.leisure === 'playground'
            ? '#c5a480'
            : properties.aeroway === 'helipad'
              ? '#8d9990'
              : properties.landuse === 'farmland'
                ? '#b5b17e'
                : '#b7aa92';
        const surfaceRecord = landscape.topology.add(
          polygons,
          'land',
          0.035,
          color,
          feature,
          properties.aeroway === 'helipad' ? 80 : properties.leisure === 'playground' ? 40 : 20,
        );
        for (const polygon of polygons) {
          if ((landscape.block(polygon), properties.aeroway !== 'helipad')) {
            continue;
          }
          const rectangle = this.rectangle(polygon[0]);
          if (!rectangle || rectangle.width < 3) {
            continue;
          }
          const markingScale = Math.min(rectangle.width, rectangle.length) * 0.3;
          const markingPaths = [];
          for (const sideSign of [-1, 1]) {
            markingPaths.push([
              [(sideSign * markingScale) / 2, -markingScale],
              [(sideSign * markingScale) / 2, markingScale],
            ]);
          }
          markingPaths.push([
            [-markingScale / 2, 0],
            [markingScale / 2, 0],
          ]);
          const circle = [];
          for (let angleIndex = 0; angleIndex <= 64; angleIndex++) {
            circle.push([
              Math.cos((angleIndex * Math.PI) / 32) * markingScale * 1.4,
              Math.sin((angleIndex * Math.PI) / 32) * markingScale * 1.4,
            ]);
          }
          markingPaths.push(circle);
          const markingPolygons = [];
          for (const path of markingPaths) {
            markingPolygons.push(
              landscape.ribbon(
                path.map((point) => [
                  rectangle.center[0] +
                    point[0] * Math.cos(rectangle.angle) -
                    point[1] * Math.sin(rectangle.angle),
                  rectangle.center[1] +
                    point[0] * Math.sin(rectangle.angle) +
                    point[1] * Math.cos(rectangle.angle),
                ]),
                Math.max(0.1, markingScale * 0.08),
              ),
            );
          }
          surfaceRecord.markings.push(
            ...landscape.combine(markingPolygons, [polygon], ClipperLib.ClipType.ctIntersection),
          );
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

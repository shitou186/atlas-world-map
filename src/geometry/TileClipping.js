// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class TileClipping {
  static rectangle(anchor, bounds) {
    const degreesToRadians = Math.PI / 180;
    const earthRadius = 6378137;
    const latitudeScale = Math.cos(anchor[1] * degreesToRadians);
    const originMercatorY = Math.log(Math.tan(Math.PI / 4 + (anchor[1] * degreesToRadians) / 2));
    // 经度先展开到锚点附近，再按与场景一致的墨卡托投影计算裁剪矩形。
    let west = bounds.west;
    let east = bounds.east;
    for (; west - anchor[0] > 180;) {
      west -= 360;
    }
    for (; west - anchor[0] < -180;) {
      west += 360;
    }
    for (; east - anchor[0] > 180;) {
      east -= 360;
    }
    for (; east - anchor[0] < -180;) {
      east += 360;
    }
    if (east < west) {
      east += 360;
    }
    const rectangle = [
      (west - anchor[0]) * degreesToRadians * earthRadius * latitudeScale,
      (Math.log(Math.tan(Math.PI / 4 + (bounds.south * degreesToRadians) / 2)) - originMercatorY) *
        earthRadius *
        latitudeScale,
      (east - anchor[0]) * degreesToRadians * earthRadius * latitudeScale,
      (Math.log(Math.tan(Math.PI / 4 + (bounds.north * degreesToRadians) / 2)) - originMercatorY) *
        earthRadius *
        latitudeScale,
    ];
    if (
      !rectangle.every(Number.isFinite) ||
      rectangle[0] >= rectangle[2] ||
      rectangle[1] >= rectangle[3]
    ) {
      throw new RangeError('场景分块边界无效。');
    }
    return rectangle;
  }
  static clipMesh(mesh, rectangle, startTriangle = 0, triangleCount = mesh.positions.length / 9) {
    const attributeNames = ['positions', 'colors', 'materials'].filter(
      (attributeName) => mesh[attributeName],
    );
    const output = Object.fromEntries(attributeNames.map((attributeName) => [attributeName, []]));
    const clipBounds =
      mesh.positions instanceof Float32Array ? rectangle.map(Math.fround) : rectangle;
    // Float32 网格的边界先取同等精度，并将极近顶点吸附到边界，减少相邻瓦片裂缝。
    const tolerance = Math.max(...clipBounds.map(Math.abs), 1) * Number.EPSILON * 32 + 1e-8;
    const planes = [
      [0, clipBounds[0], 1],
      [0, clipBounds[2], -1],
      [1, clipBounds[1], 1],
      [1, clipBounds[3], -1],
    ];
    for (
      let triangleIndex = startTriangle;
      triangleIndex < startTriangle + triangleCount;
      triangleIndex++
    ) {
      const triangleOffset = triangleIndex * 9;
      const positions = mesh.positions;
      const minX = Math.min(
        positions[triangleOffset],
        positions[triangleOffset + 3],
        positions[triangleOffset + 6],
      );
      const maxX = Math.max(
        positions[triangleOffset],
        positions[triangleOffset + 3],
        positions[triangleOffset + 6],
      );
      const minY = Math.min(
        positions[triangleOffset + 1],
        positions[triangleOffset + 4],
        positions[triangleOffset + 7],
      );
      const maxY = Math.max(
        positions[triangleOffset + 1],
        positions[triangleOffset + 4],
        positions[triangleOffset + 7],
      );
      if (
        maxX < clipBounds[0] - tolerance ||
        minX > clipBounds[2] + tolerance ||
        maxY < clipBounds[1] - tolerance ||
        minY > clipBounds[3] + tolerance
      ) {
        continue;
      }
      if (
        minX > clipBounds[0] + tolerance &&
        maxX < clipBounds[2] - tolerance &&
        minY > clipBounds[1] + tolerance &&
        maxY < clipBounds[3] - tolerance
      ) {
        const edgeABX = positions[triangleOffset + 3] - positions[triangleOffset];
        const edgeABY = positions[triangleOffset + 4] - positions[triangleOffset + 1];
        const edgeABZ = positions[triangleOffset + 5] - positions[triangleOffset + 2];
        const edgeACX = positions[triangleOffset + 6] - positions[triangleOffset];
        const edgeACY = positions[triangleOffset + 7] - positions[triangleOffset + 1];
        const edgeACZ = positions[triangleOffset + 8] - positions[triangleOffset + 2];
        if (
          Math.hypot(
            edgeABY * edgeACZ - edgeABZ * edgeACY,
            edgeABZ * edgeACX - edgeABX * edgeACZ,
            edgeABX * edgeACY - edgeABY * edgeACX,
          ) < 1e-10
        ) {
          continue;
        }
        for (const attributeName of attributeNames) {
          for (let componentIndex = 0; componentIndex < 9; componentIndex++) {
            output[attributeName].push(mesh[attributeName][triangleOffset + componentIndex]);
          }
        }
        continue;
      }
      let polygon = [];
      for (let cornerIndex = 0; cornerIndex < 3; cornerIndex++) {
        const vertexIndex = triangleIndex * 3 + cornerIndex;
        const attributes = [];
        for (const attributeName of attributeNames) {
          attributes.push(
            mesh[attributeName][vertexIndex * 3],
            mesh[attributeName][vertexIndex * 3 + 1],
            mesh[attributeName][vertexIndex * 3 + 2],
          );
        }
        for (let axis = 0; axis < 2; axis++) {
          for (const boundary of [clipBounds[axis], clipBounds[axis + 2]]) {
            if (Math.abs(attributes[axis] - boundary) < tolerance) {
              attributes[axis] = boundary;
            }
          }
        }
        polygon.push(attributes);
      }
      // 上边与右边采用半开归属，避免相邻瓦片重复保留完全落在共享边上的面。
      if (!(
        polygon.every((vertex) => vertex[0] === clipBounds[2]) ||
        polygon.every((vertex) => vertex[1] === clipBounds[3])
      )) {
        // 逐半平面裁剪多边形，交点同时线性插值位置、颜色和材质属性。
        for (const [axis, boundary, insideSign] of planes) {
          if (polygon.every((vertex) => (vertex[axis] - boundary) * insideSign >= 0)) {
            continue;
          }
          const clippedVertices = [];
          for (let vertexIndex = 0; vertexIndex < polygon.length; vertexIndex++) {
            const vertex = polygon[vertexIndex];
            const nextVertex = polygon[(vertexIndex + 1) % polygon.length];
            const distance = (vertex[axis] - boundary) * insideSign;
            const nextDistance = (nextVertex[axis] - boundary) * insideSign;
            if ((distance >= 0 && clippedVertices.push(vertex), distance * nextDistance < 0)) {
              const intersectionRatio = distance / (distance - nextDistance);
              const intersection = [];
              for (let attributeIndex = 0; attributeIndex < vertex.length; attributeIndex++) {
                intersection.push(
                  vertex[attributeIndex] +
                    (nextVertex[attributeIndex] - vertex[attributeIndex]) * intersectionRatio,
                );
              }
              intersection[axis] = boundary;
              clippedVertices.push(intersection);
            }
          }
          if (((polygon = clippedVertices), polygon.length < 3)) {
            break;
          }
        }
        for (let fanIndex = 1; fanIndex < polygon.length - 1; fanIndex++) {
          const triangle = [polygon[0], polygon[fanIndex], polygon[fanIndex + 1]];
          const vertexA = triangle[0];
          const vertexB = triangle[1];
          const vertexC = triangle[2];
          const edgeABX = vertexB[0] - vertexA[0];
          const edgeABY = vertexB[1] - vertexA[1];
          const edgeABZ = vertexB[2] - vertexA[2];
          const edgeACX = vertexC[0] - vertexA[0];
          const edgeACY = vertexC[1] - vertexA[1];
          const edgeACZ = vertexC[2] - vertexA[2];
          if (
            !(
              Math.hypot(
                edgeABY * edgeACZ - edgeABZ * edgeACY,
                edgeABZ * edgeACX - edgeABX * edgeACZ,
                edgeABX * edgeACY - edgeABY * edgeACX,
              ) < 1e-10
            )
          ) {
            for (const vertex of triangle) {
              for (
                let attributeIndex = 0;
                attributeIndex < attributeNames.length;
                attributeIndex++
              ) {
                output[attributeNames[attributeIndex]].push(
                  vertex[attributeIndex * 3],
                  vertex[attributeIndex * 3 + 1],
                  vertex[attributeIndex * 3 + 2],
                );
              }
            }
          }
        }
      }
    }
    for (const attributeName of attributeNames) {
      output[attributeName] = new mesh[attributeName].constructor(output[attributeName]);
    }
    return output;
  }
  static clip(scene, bounds) {
    const rectangle = this.rectangle(scene.anchor, bounds);
    const clippedScene = {
      ...scene,
      bounds: {
        ...bounds,
      },
      features: [],
      surfaces: {},
    };
    const buildingMesh = {
      positions: scene.positions,
      colors: scene.colors,
      materials: scene.materials,
    };
    const attributeNames = ['positions', 'colors', 'materials'].filter(
      (attributeName) => buildingMesh[attributeName],
    );
    const fragments = [];
    const attributeLengths = Object.fromEntries(
      attributeNames.map((attributeName) => [attributeName, 0]),
    );
    for (const feature of scene.features) {
      const featureBounds = feature.bounds;
      if (
        featureBounds &&
        (featureBounds[0] > rectangle[2] + 1e-8 ||
          featureBounds[3] < rectangle[0] - 1e-8 ||
          featureBounds[1] > rectangle[3] + 1e-8 ||
          featureBounds[4] < rectangle[1] - 1e-8)
      ) {
        continue;
      }
      const fragment = this.clipMesh(
        buildingMesh,
        rectangle,
        feature.startTriangle,
        feature.triangleCount,
      );
      if (fragment.positions.length) {
        clippedScene.features.push({
          ...feature,
          startTriangle: attributeLengths.positions / 9,
          triangleCount: fragment.positions.length / 9,
        });
        fragments.push(fragment);
        for (const attributeName of attributeNames) {
          attributeLengths[attributeName] += fragment[attributeName].length;
        }
      }
    }
    for (const attributeName of attributeNames) {
      clippedScene[attributeName] = new scene[attributeName].constructor(
        attributeLengths[attributeName],
      );
      let outputOffset = 0;
      for (const fragment of fragments) {
        clippedScene[attributeName].set(fragment[attributeName], outputOffset);
        outputOffset += fragment[attributeName].length;
      }
    }
    clippedScene.water = this.clipMesh(
      {
        positions: scene.water,
      },
      rectangle,
    ).positions;
    for (const [surfaceName, surface] of Object.entries(scene.surfaces)) {
      clippedScene.surfaces[surfaceName] = {
        ...surface,
        ...this.clipMesh(surface, rectangle),
      };
    }
    for (const collectionName of ['trees', 'lamps', 'furniture']) {
      clippedScene[collectionName] = scene[collectionName].filter(
        (instance) =>
          instance.x >= rectangle[0] &&
          instance.x < rectangle[2] &&
          instance.y >= rectangle[1] &&
          instance.y < rectangle[3],
      );
    }
    const sleepers = [];
    for (let sleeperOffset = 0; sleeperOffset < scene.sleepers.length; sleeperOffset += 4) {
      const sleeperX = scene.sleepers[sleeperOffset];
      const sleeperY = scene.sleepers[sleeperOffset + 1];
      if (
        sleeperX >= rectangle[0] &&
        sleeperX < rectangle[2] &&
        sleeperY >= rectangle[1] &&
        sleeperY < rectangle[3]
      ) {
        sleepers.push(
          sleeperX,
          sleeperY,
          scene.sleepers[sleeperOffset + 2],
          scene.sleepers[sleeperOffset + 3],
        );
      }
    }
    clippedScene.sleepers = new Float32Array(sleepers);
    for (const collectionName of ['traffic', 'boats']) {
      clippedScene[collectionName] = scene[collectionName].filter(
        (route) =>
          route.bounds[0] <= rectangle[2] &&
          route.bounds[2] >= rectangle[0] &&
          route.bounds[1] <= rectangle[3] &&
          route.bounds[3] >= rectangle[1],
      );
    }
    clippedScene.railways = [];
    // 铁路线按参数区间裁剪，遇到不连续交点时拆段，保留原始高度插值。
    for (const railway of scene.railways) {
      let points = [];
      for (let pointOffset = 3; pointOffset < railway.points.length; pointOffset += 3) {
        const segmentStart = railway.points.subarray(pointOffset - 3, pointOffset);
        const segmentEnd = railway.points.subarray(pointOffset, pointOffset + 3);
        let enterRatio = 0;
        let exitRatio = 1;
        for (let axis = 0; axis < 2; axis++) {
          const delta = segmentEnd[axis] - segmentStart[axis];
          if (Math.abs(delta) < 1e-9) {
            if (segmentStart[axis] < rectangle[axis] || segmentStart[axis] > rectangle[axis + 2]) {
              exitRatio = -1;
            }
          } else {
            const lowerRatio = (rectangle[axis] - segmentStart[axis]) / delta;
            const upperRatio = (rectangle[axis + 2] - segmentStart[axis]) / delta;
            enterRatio = Math.max(enterRatio, Math.min(lowerRatio, upperRatio));
            exitRatio = Math.min(exitRatio, Math.max(lowerRatio, upperRatio));
          }
        }
        if (exitRatio > enterRatio) {
          const clippedStart = [
            segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * enterRatio,
            segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * enterRatio,
            segmentStart[2] + (segmentEnd[2] - segmentStart[2]) * enterRatio,
          ];
          if (
            points.length &&
            Math.hypot(points.at(-3) - clippedStart[0], points.at(-2) - clippedStart[1]) > 0.01
          ) {
            clippedScene.railways.push({
              ...railway,
              points: new Float32Array(points),
            });
            points = [];
          }
          if (!points.length) {
            points.push(...clippedStart);
          }
          points.push(
            segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * exitRatio,
            segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * exitRatio,
            segmentStart[2] + (segmentEnd[2] - segmentStart[2]) * exitRatio,
          );
        }
        if (exitRatio < 1 && points.length) {
          clippedScene.railways.push({
            ...railway,
            points: new Float32Array(points),
          });
          points = [];
        }
      }
      if (points.length) {
        clippedScene.railways.push({
          ...railway,
          points: new Float32Array(points),
        });
      }
    }
    clippedScene.treeCount = clippedScene.trees.filter((tree) => tree.source === 'node').length;
    if (scene.stats) {
      clippedScene.stats = {
        ...scene.stats,
        buildings: clippedScene.features.length,
        parts: clippedScene.features.filter((feature) => feature.part).length,
        triangles: clippedScene.positions.length / 9,
      };
    }
    if (scene.landscapeStats) {
      clippedScene.landscapeStats = {
        ...scene.landscapeStats,
        mappedTrees: clippedScene.treeCount,
        generatedTrees: clippedScene.trees.length - clippedScene.treeCount,
        lamps: clippedScene.lamps.length,
      };
    }
    return clippedScene;
  }
}
export { TileClipping };

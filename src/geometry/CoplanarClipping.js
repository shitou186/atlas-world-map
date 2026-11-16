// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class CoplanarClipping {
  static area(polygon) {
    let signedDoubleArea = 0;
    for (let vertexIndex = 0; vertexIndex < polygon.length; vertexIndex++) {
      const vertex = polygon[vertexIndex];
      const nextVertex = polygon[(vertexIndex + 1) % polygon.length];
      signedDoubleArea += vertex[0] * nextVertex[1] - nextVertex[0] * vertex[1];
    }
    return Math.abs(signedDoubleArea) / 2;
  }
  static subtract(polygon, clipTriangle) {
    // 按裁剪三角形的逆时针半平面逐边分割，收集外侧片段作为差集。
    let remainingPolygon = polygon;
    const outsidePolygons = [];
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
      const edgeStart = clipTriangle[edgeIndex];
      const edgeEnd = clipTriangle[(edgeIndex + 1) % 3];
      const edgeX = edgeEnd[0] - edgeStart[0];
      const edgeY = edgeEnd[1] - edgeStart[1];
      const insideVertices = [];
      const outsideVertices = [];
      for (let vertexIndex = 0; vertexIndex < remainingPolygon.length; vertexIndex++) {
        const vertex = remainingPolygon[vertexIndex];
        const nextVertex = remainingPolygon[(vertexIndex + 1) % remainingPolygon.length];
        const signedDistance =
          edgeX * (vertex[1] - edgeStart[1]) - edgeY * (vertex[0] - edgeStart[0]);
        const nextSignedDistance =
          edgeX * (nextVertex[1] - edgeStart[1]) - edgeY * (nextVertex[0] - edgeStart[0]);
        if (
          (signedDistance >= 0 && insideVertices.push(vertex),
          signedDistance <= 0 && outsideVertices.push(vertex),
          signedDistance * nextSignedDistance < 0)
        ) {
          const intersectionRatio = signedDistance / (signedDistance - nextSignedDistance);
          const intersection = [
            vertex[0] + (nextVertex[0] - vertex[0]) * intersectionRatio,
            vertex[1] + (nextVertex[1] - vertex[1]) * intersectionRatio,
          ];
          insideVertices.push(intersection);
          outsideVertices.push(intersection);
        }
      }
      if (insideVertices.length < 3 || this.area(insideVertices) < 1e-8) {
        return [polygon];
      }
      if (outsideVertices.length >= 3 && this.area(outsideVertices) > 1e-8) {
        outsidePolygons.push(outsideVertices);
      }
      remainingPolygon = insideVertices;
    }
    return outsidePolygons;
  }
  static resolve(positions, colors, features, materials = null) {
    // 沿法向量最大分量投影到二维；量化平面参数只用于分组，候选仍需精确共面检查。
    const planeGroups = new Map();
    const replacements = new Map();
    for (let ownerIndex = 0; ownerIndex < features.length; ownerIndex++) {
      const feature = features[ownerIndex];
      for (
        let triangleOffset = feature.startTriangle * 9;
        triangleOffset < (feature.startTriangle + feature.triangleCount) * 9;
        triangleOffset += 9
      ) {
        const vertexA = positions.slice(triangleOffset, triangleOffset + 3);
        const vertexB = positions.slice(triangleOffset + 3, triangleOffset + 6);
        const vertexC = positions.slice(triangleOffset + 6, triangleOffset + 9);
        const edgeABX = vertexB[0] - vertexA[0];
        const edgeABY = vertexB[1] - vertexA[1];
        const edgeABZ = vertexB[2] - vertexA[2];
        const edgeACX = vertexC[0] - vertexA[0];
        const edgeACY = vertexC[1] - vertexA[1];
        const edgeACZ = vertexC[2] - vertexA[2];
        const normal = [
          edgeABY * edgeACZ - edgeABZ * edgeACY,
          edgeABZ * edgeACX - edgeABX * edgeACZ,
          edgeABX * edgeACY - edgeABY * edgeACX,
        ];
        let dominantAxis = 0;
        if (Math.abs(normal[1]) > Math.abs(normal[dominantAxis])) {
          dominantAxis = 1;
        }
        if (Math.abs(normal[2]) > Math.abs(normal[dominantAxis])) {
          dominantAxis = 2;
        }
        const firstAxis = (dominantAxis + 1) % 3;
        const secondAxis = (dominantAxis + 2) % 3;
        const slopeA = -normal[firstAxis] / normal[dominantAxis];
        const slopeB = -normal[secondAxis] / normal[dominantAxis];
        const planeOffset =
          vertexA[dominantAxis] - slopeA * vertexA[firstAxis] - slopeB * vertexA[secondAxis];
        const planeKey = `${dominantAxis}/${Math.round(slopeA * 10000000)}/${Math.round(slopeB * 10000000)}/${Math.round(planeOffset * 100000)}`;
        let planeGroup = planeGroups.get(planeKey);
        if (!planeGroup) {
          planeGroup = {
            entries: [],
            owners: new Set(),
          };
          planeGroups.set(planeKey, planeGroup);
        }
        planeGroup.entries.push({
          index: triangleOffset,
          owner: ownerIndex,
          axis: dominantAxis,
          first: firstAxis,
          second: secondAxis,
          slopeA: slopeA,
          slopeB: slopeB,
          offset: planeOffset,
          points: [
            [vertexA[firstAxis], vertexA[secondAxis]],
            [vertexB[firstAxis], vertexB[secondAxis]],
            [vertexC[firstAxis], vertexC[secondAxis]],
          ],
        });
        planeGroup.owners.add(ownerIndex);
      }
    }
    for (const planeGroup of planeGroups.values()) {
      if (planeGroup.owners.size < 2) {
        continue;
      }
      const spatialCells = new Map();
      const largeTriangles = [];
      for (const triangle of planeGroup.entries) {
        const projectedPoints = triangle.points;
        const bounds = [
          Math.min(...projectedPoints.map((point) => point[0])),
          Math.min(...projectedPoints.map((point) => point[1])),
          Math.max(...projectedPoints.map((point) => point[0])),
          Math.max(...projectedPoints.map((point) => point[1])),
        ];
        const minCellX = Math.floor(bounds[0] / 32);
        const minCellY = Math.floor(bounds[1] / 32);
        const maxCellX = Math.floor(bounds[2] / 32);
        const maxCellY = Math.floor(bounds[3] / 32);
        const candidates = new Set(largeTriangles);
        // 每格 32 米，覆盖超过 4096 格的三角形单独保存，避免空间哈希膨胀。
        const exceedsCellLimit = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1) > 4096;
        if (exceedsCellLimit) {
          for (const cellEntries of spatialCells.values()) {
            for (const candidate of cellEntries) {
              candidates.add(candidate);
            }
          }
        } else {
          for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
            for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
              for (const candidate of spatialCells.get(`${cellX}/${cellY}`) || []) {
                candidates.add(candidate);
              }
            }
          }
        }
        // 仅减去其他要素已经登记的共面三角形，按处理顺序消除重复覆盖。
        let fragments = [projectedPoints];
        for (const candidate of candidates) {
          if (
            candidate.owner === triangle.owner ||
            candidate.bounds[0] >= bounds[2] - 1e-7 ||
            candidate.bounds[2] <= bounds[0] + 1e-7 ||
            candidate.bounds[1] >= bounds[3] - 1e-7 ||
            candidate.bounds[3] <= bounds[1] + 1e-7
          ) {
            continue;
          }
          let isCoplanar = true;
          for (const point of projectedPoints) {
            if (
              Math.abs(
                (triangle.slopeA - candidate.slopeA) * point[0] +
                  (triangle.slopeB - candidate.slopeB) * point[1] +
                  triangle.offset -
                  candidate.offset,
              ) > 0.00001
            ) {
              isCoplanar = false;
            }
          }
          if (!isCoplanar) {
            continue;
          }
          const remainingFragments = [];
          for (const fragment of fragments) {
            remainingFragments.push(...this.subtract(fragment, candidate.points));
          }
          if (((fragments = remainingFragments), !fragments.length)) {
            break;
          }
        }
        if (fragments.length !== 1 || fragments[0] !== projectedPoints) {
          const replacementPositions = [];
          for (const fragment of fragments) {
            for (let fanIndex = 1; fanIndex < fragment.length - 1; fanIndex++) {
              const projectedTriangle = [fragment[0], fragment[fanIndex], fragment[fanIndex + 1]];
              if (!(this.area(projectedTriangle) < 1e-8)) {
                for (const point of projectedTriangle) {
                  const vertex = [0, 0, 0];
                  vertex[triangle.first] = point[0];
                  vertex[triangle.second] = point[1];
                  vertex[triangle.axis] =
                    triangle.slopeA * point[0] + triangle.slopeB * point[1] + triangle.offset;
                  replacementPositions.push(...vertex);
                }
              }
            }
          }
          replacements.set(triangle.index, replacementPositions);
        }
        const signedDoubleArea =
          (projectedPoints[1][0] - projectedPoints[0][0]) *
            (projectedPoints[2][1] - projectedPoints[0][1]) -
          (projectedPoints[1][1] - projectedPoints[0][1]) *
            (projectedPoints[2][0] - projectedPoints[0][0]);
        // 统一裁剪边的绕序，确保差集算法将左侧识别为三角形内部。
        const indexedTriangle = {
          ...triangle,
          bounds: bounds,
          points:
            signedDoubleArea < 0
              ? [projectedPoints[0], projectedPoints[2], projectedPoints[1]]
              : projectedPoints,
        };
        if (exceedsCellLimit) {
          largeTriangles.push(indexedTriangle);
        } else {
          for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
            for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
              const cellKey = `${cellX}/${cellY}`;
              if (!spatialCells.has(cellKey)) {
                spatialCells.set(cellKey, []);
              }
              spatialCells.get(cellKey).push(indexedTriangle);
            }
          }
        }
      }
    }
    if (!replacements.size) {
      return {
        positions: positions,
        colors: colors,
        materials: materials,
        features: features,
        clipped: 0,
      };
    }
    // 重建顶点后同步更新要素的三角形区间，颜色与材质沿用原三角形属性。
    const outputPositions = [];
    const outputColors = [];
    const outputMaterials = [];
    const outputFeatures = [];
    for (const feature of features) {
      const featureStart = outputPositions.length;
      const startOffset = feature.startTriangle * 9;
      const endOffset = startOffset + feature.triangleCount * 9;
      for (let triangleOffset = startOffset; triangleOffset < endOffset; triangleOffset += 9) {
        const replacement = replacements.get(triangleOffset);
        if (replacement) {
          for (let componentOffset = 0; componentOffset < replacement.length; componentOffset++) {
            outputPositions.push(replacement[componentOffset]);
            outputColors.push(colors[triangleOffset + (componentOffset % 3)]);
            if (materials) {
              outputMaterials.push(materials[triangleOffset + (componentOffset % 3)]);
            }
          }
        } else {
          for (
            let sourceOffset = triangleOffset;
            sourceOffset < triangleOffset + 9;
            sourceOffset++
          ) {
            outputPositions.push(positions[sourceOffset]);
            outputColors.push(colors[sourceOffset]);
            if (materials) {
              outputMaterials.push(materials[sourceOffset]);
            }
          }
        }
      }
      feature.startTriangle = featureStart / 9;
      feature.triangleCount = (outputPositions.length - featureStart) / 9;
      if (feature.triangleCount) {
        outputFeatures.push(feature);
      }
    }
    return {
      positions: outputPositions,
      colors: outputColors,
      materials: materials ? outputMaterials : null,
      features: outputFeatures,
      clipped: replacements.size,
    };
  }
}
export { CoplanarClipping };

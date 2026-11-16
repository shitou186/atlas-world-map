// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class MeshPacking {
  static geometry(geometry, features = null) {
    const packedPositions = [];
    const packedColors = [];
    const packedMaterials = [];
    const packedNormals = [];
    const indices = [];
    // 用 Float32 的位模式参与哈希，位置、面法线、颜色和材质共同决定顶点是否可合并。
    const positionBits = new Uint32Array(
      geometry.positions.buffer,
      geometry.positions.byteOffset,
      geometry.positions.length,
    );
    const colorBits = geometry.colors
      ? new Uint32Array(geometry.colors.buffer, geometry.colors.byteOffset, geometry.colors.length)
      : null;
    const materialBits = geometry.materials
      ? new Uint32Array(
          geometry.materials.buffer,
          geometry.materials.byteOffset,
          geometry.materials.length,
        )
      : null;
    const faceNormal = new Float32Array(3);
    const normalBits = new Uint32Array(faceNormal.buffer);
    const collisionNext = [];
    const featureRanges = features || [
      {
        startTriangle: 0,
        triangleCount: geometry.positions.length / 9,
      },
    ];
    for (const feature of featureRanges) {
      // 各要素独立去重，保留连续顶点范围；哈希冲突通过链表和完整属性比较处理。
      const hashBuckets = new Map();
      feature.startVertex = packedPositions.length / 3;
      for (
        let triangleOffset = feature.startTriangle * 9;
        triangleOffset < (feature.startTriangle + feature.triangleCount) * 9;
        triangleOffset += 9
      ) {
        const positions = geometry.positions;
        const edgeABX = positions[triangleOffset + 3] - positions[triangleOffset];
        const edgeABY = positions[triangleOffset + 4] - positions[triangleOffset + 1];
        const edgeABZ = positions[triangleOffset + 5] - positions[triangleOffset + 2];
        const edgeACX = positions[triangleOffset + 6] - positions[triangleOffset];
        const edgeACY = positions[triangleOffset + 7] - positions[triangleOffset + 1];
        const edgeACZ = positions[triangleOffset + 8] - positions[triangleOffset + 2];
        const normalX = edgeABY * edgeACZ - edgeABZ * edgeACY;
        const normalY = edgeABZ * edgeACX - edgeABX * edgeACZ;
        const normalZ = edgeABX * edgeACY - edgeABY * edgeACX;
        const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
        faceNormal[0] = normalX / normalLength;
        faceNormal[1] = normalY / normalLength;
        faceNormal[2] = normalZ / normalLength;
        for (let cornerIndex = 0; cornerIndex < 3; cornerIndex++) {
          const sourceOffset = triangleOffset + cornerIndex * 3;
          let vertexHash = 2166136261;
          for (let componentIndex = 0; componentIndex < 3; componentIndex++) {
            vertexHash = Math.imul(
              vertexHash ^ positionBits[sourceOffset + componentIndex],
              16777619,
            );
            vertexHash = Math.imul(vertexHash ^ normalBits[componentIndex], 16777619);
            if (colorBits) {
              vertexHash = Math.imul(
                vertexHash ^ colorBits[sourceOffset + componentIndex],
                16777619,
              );
            }
            if (materialBits) {
              vertexHash = Math.imul(
                vertexHash ^ materialBits[sourceOffset + componentIndex],
                16777619,
              );
            }
          }
          let packedVertex = hashBuckets.get(vertexHash);
          for (; packedVertex !== void 0;) {
            const packedOffset = packedVertex * 3;
            if (
              packedPositions[packedOffset] === positions[sourceOffset] &&
              packedPositions[packedOffset + 1] === positions[sourceOffset + 1] &&
              packedPositions[packedOffset + 2] === positions[sourceOffset + 2] &&
              packedNormals[packedOffset] === faceNormal[0] &&
              packedNormals[packedOffset + 1] === faceNormal[1] &&
              packedNormals[packedOffset + 2] === faceNormal[2] &&
              (!geometry.colors ||
                (packedColors[packedOffset] === geometry.colors[sourceOffset] &&
                  packedColors[packedOffset + 1] === geometry.colors[sourceOffset + 1] &&
                  packedColors[packedOffset + 2] === geometry.colors[sourceOffset + 2])) &&
              (!geometry.materials ||
                (packedMaterials[packedOffset] === geometry.materials[sourceOffset] &&
                  packedMaterials[packedOffset + 1] === geometry.materials[sourceOffset + 1] &&
                  packedMaterials[packedOffset + 2] === geometry.materials[sourceOffset + 2]))
            ) {
              break;
            }
            packedVertex = collisionNext[packedVertex];
          }
          if (packedVertex === void 0) {
            packedVertex = packedPositions.length / 3;
            collisionNext[packedVertex] = hashBuckets.get(vertexHash);
            hashBuckets.set(vertexHash, packedVertex);
            packedPositions.push(
              positions[sourceOffset],
              positions[sourceOffset + 1],
              positions[sourceOffset + 2],
            );
            packedNormals.push(faceNormal[0], faceNormal[1], faceNormal[2]);
            if (geometry.colors) {
              packedColors.push(
                geometry.colors[sourceOffset],
                geometry.colors[sourceOffset + 1],
                geometry.colors[sourceOffset + 2],
              );
            }
            if (geometry.materials) {
              packedMaterials.push(
                geometry.materials[sourceOffset],
                geometry.materials[sourceOffset + 1],
                geometry.materials[sourceOffset + 2],
              );
            }
          }
          indices.push(packedVertex);
        }
      }
      feature.vertexCount = packedPositions.length / 3 - feature.startVertex;
    }
    geometry.positions = new Float32Array(packedPositions);
    geometry.normals = new Float32Array(packedNormals);
    if (geometry.colors) {
      geometry.colors = new Float32Array(packedColors);
    }
    if (geometry.materials) {
      geometry.materials = new Float32Array(packedMaterials);
    }
    // 顶点数决定索引位宽，保证打包结果仍可直接用于索引绘制。
    geometry.indices =
      packedPositions.length / 3 <= 65535 ? new Uint16Array(indices) : new Uint32Array(indices);
    return geometry;
  }
  static pack(scene) {
    this.geometry(scene, scene.features);
    for (const surface of Object.values(scene.surfaces)) {
      this.geometry(surface);
    }
    const waterGeometry = this.geometry({
      positions: scene.water,
    });
    scene.water = waterGeometry.positions;
    scene.waterNormals = waterGeometry.normals;
    scene.waterIndices = waterGeometry.indices;
    return scene;
  }
}
export { MeshPacking };

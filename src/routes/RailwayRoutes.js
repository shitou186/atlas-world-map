// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class RailwayRoutes {
  static build(railways) {
    // 按轨道类型、轨距和量化坐标连接节点，并去除重复边。
    const nodes = new Map();
    const edges = [];
    const seenEdges = new Set();
    for (const railway of railways) {
      if (!['rail', 'light_rail', 'tram', 'subway', 'narrow_gauge'].includes(railway.type)) {
        continue;
      }
      let previousNode = null;
      for (let pointOffset = 0; pointOffset < railway.points.length; pointOffset += 3) {
        const pointX = railway.points[pointOffset];
        const pointY = railway.points[pointOffset + 1];
        const pointZ = railway.points[pointOffset + 2];
        const nodeKey = `${railway.type}/${railway.gauge}/${Math.round(pointX * 20)}/${Math.round(pointY * 20)}/${Math.round(pointZ * 100)}`;
        if (!nodes.has(nodeKey)) {
          nodes.set(nodeKey, {
            key: nodeKey,
            x: pointX,
            y: pointY,
            z: pointZ,
            edges: [],
          });
        }
        const node = nodes.get(nodeKey);
        if (previousNode && previousNode !== node) {
          const edgeKey =
            previousNode.key < nodeKey
              ? previousNode.key + ':' + nodeKey
              : nodeKey + ':' + previousNode.key;
          if (!seenEdges.has(edgeKey)) {
            const edge = {
              key: edgeKey,
              a: previousNode.key < nodeKey ? previousNode : node,
              b: previousNode.key < nodeKey ? node : previousNode,
              type: railway.type,
              gauge: railway.gauge,
              used: false,
            };
            edges.push(edge);
            previousNode.edges.push(edge);
            node.edges.push(edge);
            seenEdges.add(edgeKey);
          }
        }
        previousNode = node;
      }
    }
    edges.sort((firstEdge, secondEdge) => firstEdge.key.localeCompare(secondEdge.key));
    const routes = [];
    // 从分岔或端点优先串联路线，再处理闭环；每条边只遍历一次。
    const boundaryEdges = edges.filter(
      (edge) => edge.a.edges.length !== 2 || edge.b.edges.length !== 2,
    );
    for (const initialEdge of [...boundaryEdges, ...edges]) {
      if (initialEdge.used) {
        continue;
      }
      let currentEdge = initialEdge;
      let currentNode = initialEdge.a.edges.length !== 2 ? initialEdge.a : initialEdge.b;
      const points = [currentNode.x, currentNode.y, currentNode.z];
      const distances = [0];
      const bounds = [currentNode.x, currentNode.y, currentNode.x, currentNode.y];
      const startNode = currentNode;
      for (; currentEdge && !currentEdge.used;) {
        currentEdge.used = true;
        const nextNode = currentEdge.a === currentNode ? currentEdge.b : currentEdge.a;
        if (
          (distances.push(
            distances.at(-1) +
              Math.hypot(
                nextNode.x - currentNode.x,
                nextNode.y - currentNode.y,
                nextNode.z - currentNode.z,
              ),
          ),
          points.push(nextNode.x, nextNode.y, nextNode.z),
          (bounds[0] = Math.min(bounds[0], nextNode.x)),
          (bounds[1] = Math.min(bounds[1], nextNode.y)),
          (bounds[2] = Math.max(bounds[2], nextNode.x)),
          (bounds[3] = Math.max(bounds[3], nextNode.y)),
          (currentNode = nextNode),
          currentNode === startNode || currentNode.edges.length !== 2)
        ) {
          break;
        }
        currentEdge = currentNode.edges[0].used ? currentNode.edges[1] : currentNode.edges[0];
      }
      const routeLength = distances.at(-1);
      if (routeLength < 70) {
        continue;
      }
      let seed = 0;
      for (const keyCharacter of startNode.key) {
        seed = (Math.imul(seed, 31) + keyCharacter.charCodeAt(0)) | 0;
      }
      routes.push({
        id: startNode.key,
        type: initialEdge.type,
        points: new Float32Array(points),
        distances: new Float32Array(distances),
        bounds: bounds,
        length: routeLength,
        loop: currentNode === startNode,
        speed: initialEdge.type === 'tram' ? 7 : 13,
        seed: seed >>> 0,
        gauge: initialEdge.gauge,
        cars: Math.min(4, Math.floor(routeLength / 35)),
      });
    }
    return routes;
  }
  static project(route, point) {
    // 将旧列车位置投影到各线段，供路线刷新时选择误差最小的连续位置。
    let closestProjection = null;
    for (let pointOffset = 3; pointOffset < route.points.length; pointOffset += 3) {
      const points = route.points;
      const previousOffset = pointOffset - 3;
      const deltaX = points[pointOffset] - points[previousOffset];
      const deltaY = points[pointOffset + 1] - points[previousOffset + 1];
      const deltaZ = points[pointOffset + 2] - points[previousOffset + 2];
      const lengthSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
      if (!lengthSquared) {
        continue;
      }
      const fraction = Math.max(
        0,
        Math.min(
          1,
          ((point[0] - points[previousOffset]) * deltaX +
            (point[1] - points[previousOffset + 1]) * deltaY +
            (point[2] - points[previousOffset + 2]) * deltaZ) /
            lengthSquared,
        ),
      );
      const errorSquared =
        (point[0] - points[previousOffset] - deltaX * fraction) ** 2 +
        (point[1] - points[previousOffset + 1] - deltaY * fraction) ** 2 +
        (point[2] - points[previousOffset + 2] - deltaZ * fraction) ** 2;
      if (!closestProjection || errorSquared < closestProjection.error) {
        closestProjection = {
          error: errorSquared,
          distance: route.distances[previousOffset / 3] + Math.sqrt(lengthSquared) * fraction,
          angle: Math.atan2(deltaY, deltaX),
        };
      }
    }
    return closestProjection;
  }
}
export { RailwayRoutes };

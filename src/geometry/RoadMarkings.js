// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { PolygonGrid } from './PolygonGrid.js';
import ClipperLib from 'clipper-lib';
class RoadMarkings {
  constructor(landscape) {
    this.landscape = landscape;
    this.roads = landscape.roads;
    // 以四位小数坐标合并道路节点，累计连接度以识别需要留白的交叉口。
    const nodesByPosition = new Map();
    for (const road of this.roads) {
      road.nodes = [];
      for (let pointIndex = 0; pointIndex < road.points.length; pointIndex++) {
        const point = road.points[pointIndex];
        const nodeKey = point[0].toFixed(4) + '/' + point[1].toFixed(4);
        if (!nodesByPosition.has(nodeKey)) {
          nodesByPosition.set(nodeKey, {
            roads: new Set(),
            degree: 0,
          });
        }
        const node = nodesByPosition.get(nodeKey);
        node.roads.add(road);
        node.degree += (pointIndex > 0 ? 1 : 0) + (pointIndex < road.points.length - 1 ? 1 : 0);
        road.nodes.push(node);
      }
    }
    this.owners = new Map();
    for (const road of this.roads) {
      if (!road.path) {
        this.owners.set(road.polygon, road);
      }
    }
    this.grid = new PolygonGrid([...this.owners.keys()], 64);
  }
  build() {
    for (const road of this.roads) {
      if (road.path || road.tags.lane_markings === 'no' || road.kind !== 'asphalt') {
        continue;
      }
      const overlappingPolygons = [];
      for (const polygon of this.grid.query(road.polygon[0])) {
        if (this.owners.get(polygon) !== road) {
          overlappingPolygons.push(polygon);
        }
      }
      // 累计里程控制虚线相位，前后段法线的斜接向量保持转角处标线连续。
      const distances = [0];
      const miterNormals = [];
      for (let pointIndex = 0; pointIndex < road.points.length; pointIndex++) {
        const point = road.points[pointIndex];
        const previousPoint = road.points[Math.max(0, pointIndex - 1)];
        const nextPoint = road.points[Math.min(road.points.length - 1, pointIndex + 1)];
        const previousLength = Math.hypot(point[0] - previousPoint[0], point[1] - previousPoint[1]);
        const nextLength = Math.hypot(nextPoint[0] - point[0], nextPoint[1] - point[1]);
        const previousNormalX = previousLength
          ? -(point[1] - previousPoint[1]) / previousLength
          : -(nextPoint[1] - point[1]) / nextLength;
        const previousNormalY = previousLength
          ? (point[0] - previousPoint[0]) / previousLength
          : (nextPoint[0] - point[0]) / nextLength;
        const nextNormalX = nextLength ? -(nextPoint[1] - point[1]) / nextLength : previousNormalX;
        const nextNormalY = nextLength ? (nextPoint[0] - point[0]) / nextLength : previousNormalY;
        const miterDenominator = Math.max(
          0.25,
          1 + previousNormalX * nextNormalX + previousNormalY * nextNormalY,
        );
        miterNormals.push([
          (previousNormalX + nextNormalX) / miterDenominator,
          (previousNormalY + nextNormalY) / miterDenominator,
        ]);
        if (pointIndex) {
          distances.push(distances.at(-1) + previousLength);
        }
      }
      // 将交叉口转为里程区间，从每段实线或虚线中扣除这些区间。
      const junctionIntervals = [];
      for (let nodeIndex = 0; nodeIndex < road.nodes.length; nodeIndex++) {
        const node = road.nodes[nodeIndex];
        if (node.degree < 3) {
          continue;
        }
        let junctionRadius = 2;
        for (const connectedRoad of node.roads) {
          if (!connectedRoad.path) {
            junctionRadius = Math.max(junctionRadius, connectedRoad.width / 2 + 2);
          }
        }
        junctionIntervals.push([
          distances[nodeIndex] - junctionRadius,
          distances[nodeIndex] + junctionRadius,
        ]);
      }
      const markingPolygons = [];
      for (let laneIndex = 0; laneIndex <= road.lanes; laneIndex++) {
        const isEdge = laneIndex === 0 || laneIndex === road.lanes;
        if (isEdge && ['residential', 'service', 'living_street'].includes(road.tags.highway)) {
          continue;
        }
        const lateralOffset = isEdge
          ? (laneIndex ? 1 : -1) * (road.width / 2 - 0.28)
          : road.width * (laneIndex / road.lanes - 0.5);
        for (let segmentIndex = 1; segmentIndex < road.points.length; segmentIndex++) {
          const segmentStart = road.points[segmentIndex - 1];
          const segmentEnd = road.points[segmentIndex];
          const segmentLength = distances[segmentIndex] - distances[segmentIndex - 1];
          const segmentStartDistance = distances[segmentIndex - 1];
          const segmentEndDistance = distances[segmentIndex];
          for (
            let dashStart = isEdge
              ? segmentStartDistance
              : Math.floor(segmentStartDistance / 8) * 8;
            dashStart < segmentEndDistance;
            dashStart += isEdge ? segmentLength : 8
          ) {
            const clippedStart = Math.max(segmentStartDistance, dashStart);
            const clippedEnd = Math.min(
              segmentEndDistance,
              dashStart + (isEdge ? segmentLength : 3),
            );
            if (clippedEnd <= clippedStart) {
              continue;
            }
            let visibleIntervals = [[clippedStart, clippedEnd]];
            for (const junctionInterval of junctionIntervals) {
              const remainingIntervals = [];
              for (const interval of visibleIntervals) {
                if (junctionInterval[1] <= interval[0] || junctionInterval[0] >= interval[1]) {
                  remainingIntervals.push(interval);
                } else {
                  if (junctionInterval[0] > interval[0]) {
                    remainingIntervals.push([interval[0], junctionInterval[0]]);
                  }
                  if (junctionInterval[1] < interval[1]) {
                    remainingIntervals.push([junctionInterval[1], interval[1]]);
                  }
                }
              }
              visibleIntervals = remainingIntervals;
            }
            for (const interval of visibleIntervals) {
              const markingRing = [];
              for (const [distance, edgeOffset] of [
                [interval[0], -0.07],
                [interval[1], -0.07],
                [interval[1], 0.07],
                [interval[0], 0.07],
              ]) {
                const segmentRatio = (distance - segmentStartDistance) / segmentLength;
                const miterNormal = [
                  miterNormals[segmentIndex - 1][0] +
                    (miterNormals[segmentIndex][0] - miterNormals[segmentIndex - 1][0]) *
                      segmentRatio,
                  miterNormals[segmentIndex - 1][1] +
                    (miterNormals[segmentIndex][1] - miterNormals[segmentIndex - 1][1]) *
                      segmentRatio,
                ];
                markingRing.push([
                  segmentStart[0] +
                    (segmentEnd[0] - segmentStart[0]) * segmentRatio +
                    miterNormal[0] * (lateralOffset + edgeOffset),
                  segmentStart[1] +
                    (segmentEnd[1] - segmentStart[1]) * segmentRatio +
                    miterNormal[1] * (lateralOffset + edgeOffset),
                ]);
              }
              markingRing.push(markingRing[0]);
              markingPolygons.push([markingRing]);
            }
          }
        }
      }
      const clippedMarkings = overlappingPolygons.length
        ? this.landscape.combine(markingPolygons, overlappingPolygons)
        : markingPolygons;
      this.landscape.surface(clippedMarkings, 'markings', road, '#f2efe4');
    }
  }
  ground(markingPolygons, roadPolygons) {
    // 按 64 米网格求标线与路面的交集，避免一次性组合整个场景的多边形。
    const markingGrid = new PolygonGrid(markingPolygons, 64);
    const roadGrid = new PolygonGrid(roadPolygons, 64);
    for (const [cellKey, entries] of markingGrid.cells) {
      const [cellX, cellY] = cellKey.split('/').map(Number);
      const originX = cellX * 64;
      const originY = cellY * 64;
      const cellRing = [
        [originX, originY],
        [originX + 64, originY],
        [originX + 64, originY + 64],
        [originX, originY + 64],
        [originX, originY],
      ];
      const nearbyRoads = roadGrid.query(cellRing);
      if (!nearbyRoads.length) {
        continue;
      }
      const clippedMarkings = this.landscape.combine(
        entries.map((entry) => entry.polygon),
        [[cellRing]],
        ClipperLib.ClipType.ctIntersection,
      );
      const groundMarkings = this.landscape.combine(
        clippedMarkings,
        nearbyRoads,
        ClipperLib.ClipType.ctIntersection,
      );
      this.landscape.topology.roadMarkings.push(...groundMarkings);
    }
  }
}
export { RoadMarkings };

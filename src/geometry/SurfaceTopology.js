// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import ClipperLib from 'clipper-lib';
import { PolygonGrid } from './PolygonGrid.js';
class SurfaceTopology {
  constructor(bounds, landscape) {
    const [west, south, east, north] = bounds;
    this.tile = [
      [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    ];
    this.landscape = landscape;
    this.records = [];
    this.sources = {};
    this.roadMarkings = [];
    this.stats = {
      surfaces: 0,
      candidates: 0,
      differences: 0,
      hidden: 0,
      unresolvedLevels: 0,
    };
  }
  add(polygons, kind, height, color, feature, priority, scope = 'area') {
    const properties = feature.properties || {};
    let minHeight = properties.min_height;
    if (typeof minHeight == 'string') {
      const heightMatch = /^\s*(-?\d+(?:\.\d+)?)\s*(m|ft)?\s*$/.exec(minHeight);
      minHeight = heightMatch
        ? Number(heightMatch[1]) * (heightMatch[2] === 'ft' ? 0.3048 : 1)
        : void 0;
    }
    const baseHeight = Number.isFinite(minHeight) ? minHeight : 0;
    const planeType =
      properties.man_made === 'pier'
        ? 'pier'
        : properties.location === 'roof'
          ? 'roof'
          : properties.bridge && properties.bridge !== 'no'
            ? 'bridge'
            : properties.tunnel && properties.tunnel !== 'no'
              ? 'tunnel'
              : 'ground';
    // 地面、屋顶、桥隧及 layer/level/最小高度共同定义平面，避免跨层误扣。
    const planeKey = `${planeType}/${properties.layer || 0}/${properties.level || 0}/${baseHeight}`;
    // 第一环是外轮廓，其余环是孔洞；用绝对面积相减，避免受输入绕序影响。
    let area = 0;
    for (const polygon of polygons) {
      for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
        const ring = polygon[ringIndex];
        let signedDoubleArea = 0;
        for (let pointIndex = 1; pointIndex < ring.length; pointIndex++) {
          signedDoubleArea +=
            ring[pointIndex - 1][0] * ring[pointIndex][1] -
            ring[pointIndex][0] * ring[pointIndex - 1][1];
        }
        area += (Math.abs(signedDoubleArea) / 2) * (ringIndex ? -1 : 1);
      }
    }
    const record = {
      polygons: polygons.length
        ? this.landscape.combine(polygons, this.tile, ClipperLib.ClipType.ctIntersection, 1000000)
        : [],
      kind: kind,
      height: height + baseHeight,
      color: color,
      priority: priority,
      plane: planeKey,
      scope: scope,
      area: area,
      key: `${kind}/${color}/${feature.id}`,
      markings: [],
    };
    this.records.push(record);
    (this.sources[kind] ||= []).push({
      id: feature.id,
      properties: {
        ...properties,
      },
      plane: planeKey,
    });
    if (
      (planeType !== 'ground' ||
        (properties.layer && properties.layer !== '0') ||
        (properties.level && properties.level !== '0')) &&
      !Number.isFinite(minHeight)
    ) {
      this.stats.unresolvedLevels++;
    }
    return record;
  }
  build(landscape) {
    const planeGrids = new Map();
    const polygonOwners = new Map();
    // 高优先级优先，同级按面积和稳定键排序；每个平面独立建立遮挡候选索引。
    this.records.sort(
      (leftRecord, rightRecord) =>
        rightRecord.priority - leftRecord.priority ||
        leftRecord.area - rightRecord.area ||
        leftRecord.key.localeCompare(rightRecord.key),
    );
    for (const [rank, record] of this.records.entries()) {
      record.rank = rank;
      if (!planeGrids.has(record.plane)) {
        planeGrids.set(record.plane, []);
      }
      for (const polygon of record.polygons) {
        planeGrids.get(record.plane).push(polygon);
        polygonOwners.set(polygon, record);
      }
    }
    for (const [planeKey, polygons] of planeGrids) {
      planeGrids.set(planeKey, new PolygonGrid(polygons, 64));
    }
    const markingGrid = new PolygonGrid(this.roadMarkings, 64);
    for (const record of this.records) {
      if (!record.polygons.length) {
        continue;
      }
      this.stats.surfaces++;
      const occluders = new Set();
      for (const polygon of record.polygons) {
        for (const candidatePolygon of planeGrids.get(record.plane).query(polygon[0])) {
          const candidateOwner = polygonOwners.get(candidatePolygon);
          if (!(
            candidateOwner.rank >= record.rank ||
            (record.scope === 'area' && candidateOwner.scope !== 'area') ||
            (record.scope === 'linear' &&
              candidateOwner.scope === 'area' &&
              (candidateOwner.priority < 40 || candidateOwner.kind === 'water'))
          )) {
            occluders.add(candidatePolygon);
          }
        }
      }
      this.stats.candidates += occluders.size;
      // 只扣除同平面中排名靠前且作用域兼容的面，随后将标线切为独立表面。
      let visiblePolygons = record.polygons;
      if (
        (occluders.size &&
          ((visiblePolygons = landscape.combine(
            visiblePolygons,
            [...occluders],
            ClipperLib.ClipType.ctDifference,
            1000000,
          )),
          this.stats.differences++),
        !visiblePolygons.length)
      ) {
        this.stats.hidden++;
        continue;
      }
      let markings = record.markings;
      if (record.scope === 'linear' && record.kind === 'asphalt') {
        const markingCandidates = new Set();
        for (const polygon of visiblePolygons) {
          for (const marking of markingGrid.query(polygon[0])) {
            markingCandidates.add(marking);
          }
        }
        markings = [...markingCandidates];
      }
      if (markings.length) {
        const clippedMarkings = landscape.combine(
          markings,
          visiblePolygons,
          ClipperLib.ClipType.ctIntersection,
          1000000,
        );
        if (clippedMarkings.length) {
          visiblePolygons = landscape.combine(
            visiblePolygons,
            clippedMarkings,
            ClipperLib.ClipType.ctDifference,
            1000000,
          );
          landscape.surface(
            clippedMarkings,
            record.scope === 'linear' ? 'markingGround' : 'sportLines',
            record.height,
            '#eee9db',
          );
        }
      }
      landscape.surface(visiblePolygons, record.kind, record.height, record.color);
    }
    return {
      surfaceSources: this.sources,
      surfaceTopologyStats: this.stats,
    };
  }
}
export { SurfaceTopology };

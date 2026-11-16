// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { BuildingGeometry } from './BuildingGeometry.js';
import { VectorTileDecoder } from './VectorTileDecoder.js';
import { LandscapeGeometry } from './LandscapeGeometry.js';
import { BoatRoutes } from '../routes/BoatRoutes.js';
import { TileClipping } from './TileClipping.js';
import { MeshPacking } from './MeshPacking.js';
class SceneAssembler {
  static VERSION = 3;
  constructor({ maxLandcoverTiles = 16, maxLandcoverVertices = 100000 } = {}) {
    this.ready = BuildingGeometry.init();
    this.landcover = new Map();
    this.landcoverVertices = 0;
    this.maxLandcoverTiles = maxLandcoverTiles;
    this.maxLandcoverVertices = maxLandcoverVertices;
  }
  vegetation(bytes, tileX, tileY, zoom, sourceKey, sceneBounds, projection) {
    // 缓存采用瓦片中心投影；删除后重新插入 Map 即更新最近使用顺序。
    const cacheKey = `${SceneAssembler.VERSION}/${sourceKey || `${zoom}/${tileX}/${tileY}`}`;
    let cachedTile = this.landcover.get(cacheKey);
    const cacheHit = !!cachedTile;
    if (cachedTile) {
      this.landcover.delete(cacheKey);
    } else {
      const tileBounds = VectorTileDecoder.bounds(tileX, tileY, zoom);
      const tileProjection = new BuildingGeometry([
        (tileBounds.west + tileBounds.east) / 2,
        (tileBounds.south + tileBounds.north) / 2,
      ]);
      cachedTile = {
        projection: tileProjection,
        records: [],
        vertices: 0,
      };
      for (const feature of VectorTileDecoder.vegetation(bytes, tileX, tileY, zoom)) {
        const polygons = tileProjection.project(feature.geometry);
        for (const polygon of polygons) {
          for (const ring of polygon) {
            cachedTile.vertices += ring.length;
          }
        }
        cachedTile.records.push({
          feature: feature,
          polygons: polygons,
        });
      }
      this.landcoverVertices += cachedTile.vertices;
    }
    // 同时限制瓦片数和顶点数，从最早使用的条目开始淘汰。
    for (
      this.landcover.set(cacheKey, cachedTile);
      this.landcover.size > this.maxLandcoverTiles ||
      this.landcoverVertices > this.maxLandcoverVertices;
    ) {
      const oldestKey = this.landcover.keys().next().value;
      this.landcoverVertices -= this.landcover.get(oldestKey).vertices;
      this.landcover.delete(oldestKey);
    }
    // 缓存坐标按投影原点和平面缩放转换到当前场景，无需重新解码植被。
    const scaleRatio = projection.scale / cachedTile.projection.scale;
    const offsetX = (cachedTile.projection.originX - projection.originX) * projection.scale;
    const offsetY = (cachedTile.projection.originY - projection.originY) * projection.scale;
    const features = [];
    for (const record of cachedTile.records) {
      const featureBounds = record.feature.bbox;
      if (
        featureBounds[2] < sceneBounds.west ||
        featureBounds[0] > sceneBounds.east ||
        featureBounds[3] < sceneBounds.south ||
        featureBounds[1] > sceneBounds.north
      ) {
        continue;
      }
      const transformedPolygons = [];
      for (const polygon of record.polygons) {
        const transformedRings = [];
        for (const ring of polygon) {
          const transformedRing = [];
          for (const point of ring) {
            transformedRing.push([
              point[0] * scaleRatio + offsetX,
              point[1] * scaleRatio + offsetY,
            ]);
          }
          transformedRings.push(transformedRing);
        }
        transformedPolygons.push(transformedRings);
      }
      features.push({
        ...record.feature,
        projectedPolygons: transformedPolygons,
      });
    }
    return {
      features: features,
      hit: cacheHit,
    };
  }
  async build({
    x: tileX,
    y: tileY,
    bytes: bytes,
    greenBytes: greenBytes,
    greenX: greenX,
    greenY: greenY,
    greenZ: greenZ,
    greenKey: greenKey,
  }) {
    const startedAt = performance.now();
    await this.ready;
    const initializedAt = performance.now();
    const features = VectorTileDecoder.decode(bytes, tileX, tileY);
    const bounds = VectorTileDecoder.bounds(tileX, tileY);
    const anchor = [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2];
    const landscape = new LandscapeGeometry(anchor, bounds);
    const vegetation = greenBytes
      ? this.vegetation(greenBytes, greenX, greenY, greenZ, greenKey, bounds, landscape.projection)
      : null;
    if (vegetation) {
      features.push(...vegetation.features);
    }
    const decodedAt = performance.now();
    const scene = new BuildingGeometry(anchor).build(features);
    const buildingsAt = performance.now();
    Object.assign(scene, landscape.build(features));
    scene.boats = BoatRoutes.build(features, landscape);
    const landscapeAt = performance.now();
    scene.anchor = anchor;
    scene.bounds = bounds;
    scene.source = 'OpenStreetMap · Streets GL · OpenFreeMap';
    scene.geometryVersion = SceneAssembler.VERSION;
    scene.landcoverSource = greenKey || null;
    // 先裁剪到瓦片边界，再按属性去重并生成索引，保证打包包含最终几何。
    const clippedScene = TileClipping.clip(scene, bounds);
    MeshPacking.pack(clippedScene);
    clippedScene.timings = {
      init: initializedAt - startedAt,
      decode: decodedAt - initializedAt,
      buildings: buildingsAt - decodedAt,
      landscape: landscapeAt - buildingsAt,
      pack: performance.now() - landscapeAt,
      total: performance.now() - startedAt,
      landcoverCacheHit: vegetation?.hit || false,
    };
    return clippedScene;
  }
}
export { SceneAssembler };

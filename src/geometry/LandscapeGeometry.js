// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { BuildingGeometry } from './BuildingGeometry.js';
import { SurfaceTopology } from './SurfaceTopology.js';
import { TileClipping } from './TileClipping.js';
import ClipperLib from 'clipper-lib';
import { Color } from 'three';
import earcut, { flatten } from 'earcut';
import { StreetFurniture } from './StreetFurniture.js';
import { RoadMarkings } from './RoadMarkings.js';
import { TrafficRoutes } from '../routes/TrafficRoutes.js';
class LandscapeGeometry {
  constructor(anchor, bounds) {
    this.projection = new BuildingGeometry(anchor);
    this.anchor = anchor;
    this.bounds = bounds;
    this.buffers = {};
    this.blockers = new Map();
    this.trees = [];
    this.treeCells = new Map();
    this.roads = [];
    this.stats = {
      roads: 0,
      inferredWidths: 0,
      mappedTrees: 0,
      generatedTrees: 0,
      crossings: 0,
      lamps: 0,
    };
    this.lamps = [];
    this.markings = {
      polygons: [],
      crossings: [],
    };
    this.topology = new SurfaceTopology(TileClipping.rectangle(anchor, bounds), this);
  }
  point(coordinate) {
    // 与建筑共用锚点、经度回绕和米制缩放，保证道路、植被及模型处于同一坐标系。
    let longitude = coordinate[0];
    for (; longitude - this.anchor[0] > 180;) {
      longitude -= 360;
    }
    for (; longitude - this.anchor[0] < -180;) {
      longitude += 360;
    }
    return [
      (((longitude * Math.PI) / 180) * 6378137 - this.projection.originX) * this.projection.scale,
      (Math.log(Math.tan(Math.PI / 4 + (coordinate[1] * Math.PI) / 360)) * 6378137 -
        this.projection.originY) *
        this.projection.scale,
    ];
  }
  random(seed) {
    // 基于稳定标识生成可重复随机数，切换瓦片或重新加载时树形、朝向不会跳变。
    let mixedSeed = Math.imul(seed ^ 2654435769, 2246822507);
    mixedSeed = Math.imul(mixedSeed ^ (mixedSeed >>> 13), 3266489909);
    return ((mixedSeed ^ (mixedSeed >>> 16)) >>> 0) / 4294967296;
  }
  combine(
    subjectPolygons,
    clipPolygons = null,
    operation = ClipperLib.ClipType.ctDifference,
    integerScale = 1000,
  ) {
    // Clipper 使用整数坐标；放大到毫米量级后计算布尔运算，再恢复闭环米制坐标。
    const clipper = new ClipperLib.Clipper();
    for (const [polygonSet, polygonType] of [
      [subjectPolygons, ClipperLib.PolyType.ptSubject],
      [clipPolygons, ClipperLib.PolyType.ptClip],
    ]) {
      if (polygonSet) {
        for (const polygon of polygonSet) {
          for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
            const integerRing = polygon[ringIndex].map((point) => ({
              X: Math.round(point[0] * integerScale),
              Y: Math.round(point[1] * integerScale),
            }));
            if (ClipperLib.Clipper.Orientation(integerRing) !== (ringIndex === 0)) {
              integerRing.reverse();
            }
            clipper.AddPath(integerRing, polygonType, true);
          }
        }
      }
    }
    const polygonTree = new ClipperLib.PolyTree();
    clipper.Execute(
      clipPolygons ? operation : ClipperLib.ClipType.ctUnion,
      polygonTree,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero,
    );
    const resultPolygons = [];
    for (const clippedPolygon of ClipperLib.JS.PolyTreeToExPolygons(polygonTree)) {
      const resultRings = [];
      for (const integerRing of [clippedPolygon.outer, ...clippedPolygon.holes]) {
        const resultRing = integerRing.map((point) => [
          point.X / integerScale,
          point.Y / integerScale,
        ]);
        resultRing.push(resultRing[0]);
        resultRings.push(resultRing);
      }
      resultPolygons.push(resultRings);
    }
    return resultPolygons;
  }
  ribbon(centerline, width) {
    // 相邻线段的法线合成斜接偏移，并限制分母，避免急弯把道路边缘无限拉长。
    const leftEdge = [];
    const rightEdge = [];
    for (let vertexIndex = 0; vertexIndex < centerline.length; vertexIndex++) {
      const currentPoint = centerline[vertexIndex];
      const previousPoint = centerline[Math.max(0, vertexIndex - 1)];
      const nextPoint = centerline[Math.min(centerline.length - 1, vertexIndex + 1)];
      const incomingLength = Math.hypot(
        currentPoint[0] - previousPoint[0],
        currentPoint[1] - previousPoint[1],
      );
      const outgoingLength = Math.hypot(
        nextPoint[0] - currentPoint[0],
        nextPoint[1] - currentPoint[1],
      );
      const incomingNormalX = incomingLength
        ? -(currentPoint[1] - previousPoint[1]) / incomingLength
        : -(nextPoint[1] - currentPoint[1]) / outgoingLength;
      const incomingNormalY = incomingLength
        ? (currentPoint[0] - previousPoint[0]) / incomingLength
        : (nextPoint[0] - currentPoint[0]) / outgoingLength;
      const outgoingNormalX = outgoingLength
        ? -(nextPoint[1] - currentPoint[1]) / outgoingLength
        : incomingNormalX;
      const outgoingNormalY = outgoingLength
        ? (nextPoint[0] - currentPoint[0]) / outgoingLength
        : incomingNormalY;
      const miterDenominator = Math.max(
        0.25,
        1 + incomingNormalX * outgoingNormalX + incomingNormalY * outgoingNormalY,
      );
      const offsetX = (((incomingNormalX + outgoingNormalX) / miterDenominator) * width) / 2;
      const offsetY = (((incomingNormalY + outgoingNormalY) / miterDenominator) * width) / 2;
      leftEdge.push([currentPoint[0] + offsetX, currentPoint[1] + offsetY]);
      rightEdge.push([currentPoint[0] - offsetX, currentPoint[1] - offsetY]);
    }
    const ribbonRing = [...leftEdge, ...rightEdge.reverse()];
    ribbonRing.push(ribbonRing[0]);
    return [ribbonRing];
  }
  surface(polygons, surfaceKind, elevation, color, sideDepth = 0) {
    // 顶面按孔洞三角化；需要路缘厚度时补侧壁，标线则延后交给地表拓扑统一裁剪。
    if (surfaceKind === 'markings' || surfaceKind === 'crossings') {
      this.markings[surfaceKind === 'crossings' ? 'crossings' : 'polygons'].push(...polygons);
      return;
    }
    const surfaceBuffer = (this.buffers[surfaceKind] ||= {
      positions: [],
      colors: [],
    });
    const linearColor = new Color(color).toArray();
    for (const polygon of polygons) {
      const flattenedPolygon = flatten(polygon);
      const triangleIndices = earcut(flattenedPolygon.vertices, flattenedPolygon.holes, 2);
      for (const vertexIndex of triangleIndices) {
        surfaceBuffer.positions.push(
          flattenedPolygon.vertices[vertexIndex * 2],
          flattenedPolygon.vertices[vertexIndex * 2 + 1],
          elevation,
        );
        surfaceBuffer.colors.push(...linearColor);
      }
      if (sideDepth) {
        for (const ring of polygon) {
          for (let edgeIndex = 1; edgeIndex < ring.length; edgeIndex++) {
            const edgeStart = ring[edgeIndex - 1];
            const edgeEnd = ring[edgeIndex];
            surfaceBuffer.positions.push(
              ...edgeStart,
              elevation,
              ...edgeEnd,
              elevation,
              ...edgeEnd,
              elevation - sideDepth,
              ...edgeStart,
              elevation,
              ...edgeEnd,
              elevation - sideDepth,
              ...edgeStart,
              elevation - sideDepth,
            );
            for (let cornerIndex = 0; cornerIndex < 6; cornerIndex++) {
              surfaceBuffer.colors.push(
                linearColor[0] * 0.83,
                linearColor[1] * 0.83,
                linearColor[2] * 0.83,
              );
            }
          }
        }
      }
    }
  }
  contains(point, polygon) {
    // 奇偶射线法同时遍历外环和孔洞；落入洞内会抵消一次穿越，结果视为不在面内。
    let inside = false;
    for (const ring of polygon) {
      for (
        let currentIndex = 0, previousIndex = ring.length - 1;
        currentIndex < ring.length;
        previousIndex = currentIndex++
      ) {
        const currentPoint = ring[currentIndex];
        const previousPoint = ring[previousIndex];
        if (
          currentPoint[1] > point[1] != previousPoint[1] > point[1] &&
          point[0] <
            ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
              (previousPoint[1] - currentPoint[1]) +
              currentPoint[0]
        ) {
          inside = !inside;
        }
      }
    }
    return inside;
  }
  block(polygon) {
    // 只登记与当前瓦片相交的 40 米网格，用于快速排除建筑、道路和水域内的生成树。
    const polygonBounds = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
    for (const vertex of polygon[0]) {
      polygonBounds[0] = Math.min(polygonBounds[0], vertex[0]);
      polygonBounds[1] = Math.min(polygonBounds[1], vertex[1]);
      polygonBounds[2] = Math.max(polygonBounds[2], vertex[0]);
      polygonBounds[3] = Math.max(polygonBounds[3], vertex[1]);
    }
    const tileMinimum = this.point([this.bounds.west, this.bounds.south]);
    const tileMaximum = this.point([this.bounds.east, this.bounds.north]);
    for (
      let cellX = Math.floor(Math.max(tileMinimum[0], polygonBounds[0]) / 40);
      cellX <= Math.floor(Math.min(tileMaximum[0], polygonBounds[2]) / 40);
      cellX++
    ) {
      for (
        let cellY = Math.floor(Math.max(tileMinimum[1], polygonBounds[1]) / 40);
        cellY <= Math.floor(Math.min(tileMaximum[1], polygonBounds[3]) / 40);
        cellY++
      ) {
        const cellKey = `${cellX}/${cellY}`;
        if (!this.blockers.has(cellKey)) {
          this.blockers.set(cellKey, []);
        }
        this.blockers.get(cellKey).push(polygon);
      }
    }
  }
  tree(position, tags, treeId, sourceType) {
    // OSM 明确标注的树节点优先保留；自动树需避开阻挡面，并与邻近树保持四米间距。
    const tileMinimum = this.point([this.bounds.west, this.bounds.south]);
    const tileMaximum = this.point([this.bounds.east, this.bounds.north]);
    if (
      position[0] < tileMinimum[0] ||
      position[0] > tileMaximum[0] ||
      position[1] < tileMinimum[1] ||
      position[1] > tileMaximum[1]
    ) {
      return;
    }
    const cellX = Math.floor(position[0] / 4);
    const cellY = Math.floor(position[1] / 4);
    if (sourceType !== 'node') {
      for (const blockingPolygon of this.blockers.get(
        `${Math.floor(position[0] / 40)}/${Math.floor(position[1] / 40)}`,
      ) || []) {
        if (this.contains(position, blockingPolygon)) {
          return;
        }
      }
      for (let neighborX = cellX - 1; neighborX <= cellX + 1; neighborX++) {
        for (let neighborY = cellY - 1; neighborY <= cellY + 1; neighborY++) {
          for (const existingTree of this.treeCells.get(`${neighborX}/${neighborY}`) || []) {
            if (Math.hypot(existingTree[0] - position[0], existingTree[1] - position[1]) < 4) {
              return;
            }
          }
        }
      }
    }
    let treeSeed = 0;
    for (const character of treeId) {
      treeSeed = (Math.imul(treeSeed, 31) + character.charCodeAt(0)) | 0;
    }
    const taggedDimensions = [tags.height, tags.diameter_crown];
    for (let dimensionIndex = 0; dimensionIndex < taggedDimensions.length; dimensionIndex++) {
      if (typeof taggedDimensions[dimensionIndex] == 'string') {
        const dimensionMatch = /^\s*(\d+(?:\.\d+)?)\s*(m|ft)?\s*$/.exec(
          taggedDimensions[dimensionIndex],
        );
        taggedDimensions[dimensionIndex] = dimensionMatch
          ? Number(dimensionMatch[1]) * (dimensionMatch[2] === 'ft' ? 0.3048 : 1)
          : void 0;
      }
    }
    const [taggedHeight, taggedCrown] = taggedDimensions;
    const isConifer =
      tags.leaf_type === 'needleleaved' ||
      /Pinus|Picea|Abies|松|杉/.test(tags.genus || tags.species || '');
    const treeHeight =
      Number.isFinite(taggedHeight) && taggedHeight > 0
        ? taggedHeight
        : 8 + this.random(treeSeed) * 7;
    this.trees.push({
      id: treeId,
      x: position[0],
      y: position[1],
      height: treeHeight,
      crown:
        Number.isFinite(taggedCrown) && taggedCrown > 0
          ? taggedCrown
          : treeHeight * (isConifer ? 0.46 : 0.62),
      variant: isConifer ? 3 : Math.floor(this.random(treeSeed + 1) * 3),
      angle: this.random(treeSeed + 2) * Math.PI * 2,
      source: sourceType,
      inferredHeight: !(Number.isFinite(taggedHeight) && taggedHeight > 0),
      inferredCrown: !(Number.isFinite(taggedCrown) && taggedCrown > 0),
    });
    const cellKey = `${cellX}/${cellY}`;
    if (!this.treeCells.has(cellKey)) {
      this.treeCells.set(cellKey, []);
    }
    this.treeCells.get(cellKey).push(position);
    this.stats[sourceType === 'node' ? 'mappedTrees' : 'generatedTrees']++;
  }
  build(features) {
    // 先收集原始点线面与阻挡区，再生成道路/路缘、设施、标线、植被，最后统一地表拓扑。
    const roadsByMaterial = new Map();
    const vegetationAreas = [];
    const treeRows = [];
    const crossingNodes = [];
    const crossingWays = [];
    for (const sourceFeature of features) {
      const tags = sourceFeature.properties;
      const geometry = sourceFeature.geometry;
      if (geometry.type === 'Point') {
        if (tags.highway === 'street_lamp') {
          const lampPosition = this.point(geometry.coordinates);
          const taggedHeight = tags.height;
          const taggedDirection = tags.direction;
          this.lamps.push({
            id: sourceFeature.id,
            x: lampPosition[0],
            y: lampPosition[1],
            z: 0.08,
            height: taggedHeight > 0 ? taggedHeight : 8,
            angle: Number.isFinite(taggedDirection)
              ? Math.PI / 2 - (taggedDirection * Math.PI) / 180
              : null,
            inferredHeight: !(taggedHeight > 0),
          });
          this.stats.lamps++;
        }
        if (tags.natural === 'tree') {
          this.tree(this.point(geometry.coordinates), tags, sourceFeature.id, 'node');
        }
        if (
          tags.highway === 'crossing' &&
          tags.crossing !== 'unmarked' &&
          tags['crossing:markings'] !== 'no'
        ) {
          crossingNodes.push(this.point(geometry.coordinates));
        }
        continue;
      }
      if (
        (tags.natural === 'tree_row' &&
          geometry.type === 'LineString' &&
          treeRows.push(sourceFeature),
        tags.footway === 'crossing' &&
          geometry.type === 'LineString' &&
          tags['crossing:markings'] !== 'no' &&
          tags.crossing !== 'unmarked' &&
          crossingWays.push(geometry.coordinates.map((coordinate) => this.point(coordinate))),
        ['Polygon', 'MultiPolygon'].includes(geometry.type))
      ) {
        const projectedPolygons =
          sourceFeature.projectedPolygons || this.projection.project(geometry);
        if (
          tags.building ||
          tags['building:part'] ||
          tags.natural === 'water' ||
          tags.waterway === 'riverbank'
        ) {
          for (const blockingPolygon of projectedPolygons) {
            this.block(blockingPolygon);
          }
        }
        if (
          ((tags.natural === 'water' || tags.waterway === 'riverbank') &&
            this.topology.add(projectedPolygons, 'water', 0.03, '#90a0b7', sourceFeature, 90),
          ['wood', 'scrub', 'grassland', 'heath'].includes(tags.natural) ||
            [
              'forest',
              'grass',
              'meadow',
              'village_green',
              'orchard',
              'vineyard',
              'flowerbed',
            ].includes(tags.landuse) ||
            ['park', 'garden'].includes(tags.leisure))
        ) {
          const generatesForest =
            tags.natural === 'wood' ||
            tags.landuse === 'forest' ||
            tags.landuse === 'orchard' ||
            tags.leisure === 'park';
          vegetationAreas.push({
            polygons: projectedPolygons,
            tags: tags,
            id: sourceFeature.id,
            forest: generatesForest,
          });
          this.topology.add(projectedPolygons, 'grass', 0.025, '#a2b169', sourceFeature, 10);
        }
        if (
          (tags.highway && tags.area === 'yes') ||
          tags.amenity === 'parking' ||
          tags.man_made === 'pier'
        ) {
          const isAsphalt =
            tags.amenity === 'parking' || tags.surface === 'asphalt' || tags.highway === 'service';
          this.topology.add(
            projectedPolygons,
            isAsphalt ? 'asphalt' : 'paving',
            0.07,
            isAsphalt ? '#858989' : '#c9c2b2',
            sourceFeature,
            60,
          );
        }
      }
      if (
        !tags.highway ||
        geometry.type !== 'LineString' ||
        ['proposed', 'construction', 'steps'].includes(tags.highway) ||
        tags.footway === 'crossing' ||
        tags.tunnel === 'yes'
      ) {
        continue;
      }
      const roadPoints = [];
      for (const coordinate of geometry.coordinates) {
        const projectedPoint = this.point(coordinate);
        if (
          !roadPoints.length ||
          Math.hypot(
            projectedPoint[0] - roadPoints.at(-1)[0],
            projectedPoint[1] - roadPoints.at(-1)[1],
          ) > 0.001
        ) {
          roadPoints.push([...projectedPoint, 0.07]);
        }
      }
      if (roadPoints.length < 2) {
        continue;
      }
      const isPath = ['footway', 'path', 'pedestrian', 'cycleway', 'track'].includes(tags.highway);
      const taggedLanes =
        tags.lanes || (tags['lanes:forward'] || 0) + (tags['lanes:backward'] || 0);
      const roadClass = tags.highway.replace('_link', '');
      const isOneWay = tags.oneway === 'yes' || tags.oneway === '-1';
      const laneWidth = ['motorway', 'trunk'].includes(roadClass)
        ? 3.5
        : ['primary', 'secondary'].includes(roadClass)
          ? 3.1
          : 2.8;
      const pathWidths = {
        footway: 1.4,
        path: 1.2,
        pedestrian: 3,
        cycleway: 2,
        track: 2.5,
      };
      const roadWidths = {
        motorway: 7,
        trunk: 7,
        primary: 6.2,
        secondary: 6.2,
        tertiary: 5.6,
        residential: 5,
        service: 2.8,
        living_street: 4,
      };
      // 显式宽度优先，其次车道数和道路类型；推断标志随 roadMetadata 返回便于诊断。
      const taggedWidth = tags.width;
      const roadWidth =
        taggedWidth > 0
          ? taggedWidth
          : isPath
            ? pathWidths[tags.highway]
            : taggedLanes
              ? taggedLanes * laneWidth
              : isOneWay || tags.highway.endsWith('_link')
                ? laneWidth
                : roadWidths[roadClass] || 5;
      const laneCount = isPath ? 0 : taggedLanes || Math.max(1, Math.round(roadWidth / laneWidth));
      const surfaceKind = ['gravel', 'dirt', 'unpaved', 'ground', 'fine_gravel'].includes(
        tags.surface,
      )
        ? 'gravel'
        : ['paving_stones', 'sett', 'cobblestone'].includes(tags.surface) ||
            (isPath && tags.surface !== 'asphalt')
          ? 'paving'
          : 'asphalt';
      const roadPolygon = this.ribbon(roadPoints, roadWidth);
      const roadRecord = {
        id: sourceFeature.id,
        tags: tags,
        points: roadPoints,
        width: roadWidth,
        lanes: laneCount,
        z: 0.07,
        path: isPath,
        kind: surfaceKind,
        polygon: roadPolygon,
        inferredWidth: !(taggedWidth > 0),
        inferredLanes: !taggedLanes,
      };
      this.roads.push(roadRecord);
      this.block(this.ribbon(roadPoints, roadWidth + 2));
      this.stats.roads++;
      if (roadRecord.inferredWidth) {
        this.stats.inferredWidths++;
      }
    }
    const roadPolygons = [];
    const sidewalkPolygons = [];
    for (const road of this.roads) {
      const {
        points: roadPoints,
        tags: roadTags,
        path: isPath,
        width: roadWidth,
        kind: surfaceKind,
      } = road;
      if (
        (roadsByMaterial.has(surfaceKind) || roadsByMaterial.set(surfaceKind, []),
        roadsByMaterial.get(surfaceKind).push(road.polygon),
        roadPolygons.push(road.polygon),
        !isPath && ['both', 'yes', 'left', 'right'].includes(roadTags.sidewalk))
      ) {
        for (const sidewalkSide of roadTags.sidewalk === 'left'
          ? [1]
          : roadTags.sidewalk === 'right'
            ? [-1]
            : [1, -1]) {
          const sidewalkWidth =
            roadTags[sidewalkSide === 1 ? 'sidewalk:left:width' : 'sidewalk:right:width'] ||
            roadTags['sidewalk:width'] ||
            1.5;
          const sidewalkPoints = [];
          for (let vertexIndex = 0; vertexIndex < roadPoints.length; vertexIndex++) {
            const previousPoint = roadPoints[Math.max(0, vertexIndex - 1)];
            const nextPoint = roadPoints[Math.min(roadPoints.length - 1, vertexIndex + 1)];
            const tangentLength = Math.hypot(
              nextPoint[0] - previousPoint[0],
              nextPoint[1] - previousPoint[1],
            );
            sidewalkPoints.push([
              roadPoints[vertexIndex][0] -
                ((((nextPoint[1] - previousPoint[1]) / tangentLength) *
                  (roadWidth + sidewalkWidth)) /
                  2) *
                  sidewalkSide,
              roadPoints[vertexIndex][1] +
                ((((nextPoint[0] - previousPoint[0]) / tangentLength) *
                  (roadWidth + sidewalkWidth)) /
                  2) *
                  sidewalkSide,
            ]);
          }
          sidewalkPolygons.push(this.ribbon(sidewalkPoints, sidewalkWidth));
        }
      }
    }
    for (const road of this.roads) {
      const surfaceKind = road.kind;
      this.topology.add(
        [road.polygon],
        surfaceKind,
        road.z,
        surfaceKind === 'asphalt' ? '#858989' : surfaceKind === 'paving' ? '#c9c2b2' : '#aa9e83',
        {
          id: road.id,
          properties: road.tags,
        },
        surfaceKind === 'asphalt' ? 3 : surfaceKind === 'paving' ? 2 : 1,
        'linear',
      );
    }
    // 人行道扣除道路面，避免路缘与路面重叠；路缘也登记为树木生成的阻挡区。
    const visibleSidewalks = sidewalkPolygons.length
      ? this.combine(sidewalkPolygons, roadPolygons)
      : [];
    this.surface(visibleSidewalks, 'curb', 0.23, '#d6d0c3', 0.16);
    for (const sidewalkPolygon of visibleSidewalks) {
      this.block(sidewalkPolygon);
    }
    const furnitureGeometry = new StreetFurniture(this).build(features);
    const roadMarkings = new RoadMarkings(this);
    roadMarkings.build();
    const placedCrossingCenters = [];
    for (const crossingPoints of crossingWays) {
      const crossingStart = crossingPoints[0];
      const crossingEnd = crossingPoints.at(-1);
      const crossingLength = Math.hypot(
        crossingEnd[0] - crossingStart[0],
        crossingEnd[1] - crossingStart[1],
      );
      if (crossingLength < 1) {
        continue;
      }
      const directionX = (crossingEnd[0] - crossingStart[0]) / crossingLength;
      const directionY = (crossingEnd[1] - crossingStart[1]) / crossingLength;
      placedCrossingCenters.push([
        (crossingStart[0] + crossingEnd[0]) / 2,
        (crossingStart[1] + crossingEnd[1]) / 2,
      ]);
      for (
        let stripeDistance = 0.25;
        stripeDistance < crossingLength - 0.25;
        stripeDistance += 0.9
      ) {
        const stripeCenterX = crossingStart[0] + directionX * stripeDistance;
        const stripeCenterY = crossingStart[1] + directionY * stripeDistance;
        this.surface(
          [
            this.ribbon(
              [
                [stripeCenterX - directionY * 1.5, stripeCenterY + directionX * 1.5],
                [stripeCenterX + directionY * 1.5, stripeCenterY - directionX * 1.5],
              ],
              0.45,
            ),
          ],
          'crossings',
          0.07,
          '#f2efe4',
        );
      }
    }
    for (const crossingPosition of crossingNodes) {
      if (
        placedCrossingCenters.some(
          (existingCenter) =>
            Math.hypot(
              existingCenter[0] - crossingPosition[0],
              existingCenter[1] - crossingPosition[1],
            ) < 4,
        )
      ) {
        continue;
      }
      let nearestRoad = null;
      let nearestDistance = 9;
      for (const candidateRoad of this.roads) {
        if (!candidateRoad.path) {
          for (
            let segmentIndex = 0;
            segmentIndex < candidateRoad.points.length - 1;
            segmentIndex++
          ) {
            const segmentStart = candidateRoad.points[segmentIndex];
            const segmentEnd = candidateRoad.points[segmentIndex + 1];
            const deltaX = segmentEnd[0] - segmentStart[0];
            const deltaY = segmentEnd[1] - segmentStart[1];
            const segmentLength = Math.hypot(deltaX, deltaY);
            const projectedFraction = Math.max(
              0,
              Math.min(
                1,
                ((crossingPosition[0] - segmentStart[0]) * deltaX +
                  (crossingPosition[1] - segmentStart[1]) * deltaY) /
                  segmentLength ** 2,
              ),
            );
            const projectedPoint = [
              segmentStart[0] + projectedFraction * deltaX,
              segmentStart[1] + projectedFraction * deltaY,
            ];
            const distanceToRoad = Math.hypot(
              projectedPoint[0] - crossingPosition[0],
              projectedPoint[1] - crossingPosition[1],
            );
            if (distanceToRoad < nearestDistance) {
              nearestDistance = distanceToRoad;
              nearestRoad = {
                road: candidateRoad,
                point: projectedPoint,
                dx: deltaX / segmentLength,
                dy: deltaY / segmentLength,
              };
            }
          }
        }
      }
      if (!nearestRoad) {
        continue;
      }
      const {
        road: crossingRoad,
        point: roadPoint,
        dx: roadDirectionX,
        dy: roadDirectionY,
      } = nearestRoad;
      placedCrossingCenters.push(roadPoint);
      for (
        let stripeOffset = -crossingRoad.width / 2 + 0.6;
        stripeOffset < crossingRoad.width / 2 - 0.2;
        stripeOffset += 1
      ) {
        const stripeCenter = [
          roadPoint[0] - roadDirectionY * stripeOffset,
          roadPoint[1] + roadDirectionX * stripeOffset,
        ];
        this.surface(
          [
            this.ribbon(
              [
                [stripeCenter[0] - roadDirectionX * 1.7, stripeCenter[1] - roadDirectionY * 1.7],
                [stripeCenter[0] + roadDirectionX * 1.7, stripeCenter[1] + roadDirectionY * 1.7],
              ],
              0.45,
            ),
          ],
          'crossings',
          crossingRoad,
          '#f2efe4',
        );
      }
      this.stats.crossings++;
    }
    roadMarkings.ground(
      [...this.markings.polygons, ...this.markings.crossings],
      roadsByMaterial.get('asphalt') || [],
    );
    for (const treeRow of treeRows) {
      const rowPoints = treeRow.geometry.coordinates.map((coordinate) => this.point(coordinate));
      let distanceAlongSegment = 0;
      let treeIndex = 0;
      for (let segmentIndex = 0; segmentIndex < rowPoints.length - 1; segmentIndex++) {
        const segmentStart = rowPoints[segmentIndex];
        const segmentEnd = rowPoints[segmentIndex + 1];
        const segmentLength = Math.hypot(
          segmentEnd[0] - segmentStart[0],
          segmentEnd[1] - segmentStart[1],
        );
        for (; distanceAlongSegment < segmentLength; distanceAlongSegment += 9) {
          this.tree(
            [
              segmentStart[0] +
                ((segmentEnd[0] - segmentStart[0]) * distanceAlongSegment) / segmentLength,
              segmentStart[1] +
                ((segmentEnd[1] - segmentStart[1]) * distanceAlongSegment) / segmentLength,
            ],
            treeRow.properties,
            `${treeRow.id}/${treeIndex++}`,
            'row',
          );
        }
        distanceAlongSegment -= segmentLength;
      }
    }
    const tileMinimum = this.point([this.bounds.west, this.bounds.south]);
    const tileMaximum = this.point([this.bounds.east, this.bounds.north]);
    // 使用近似全球固定的网格和坐标哈希布树，减少相邻瓦片的随机接缝与重复布局。
    const latitudeGridScale = Math.cos((Math.round(this.anchor[1]) * Math.PI) / 180);
    const localGridScale = this.projection.scale / latitudeGridScale;
    const worldGridOrigin = [
      this.projection.originX * latitudeGridScale,
      this.projection.originY * latitudeGridScale,
    ];
    for (const vegetationArea of vegetationAreas) {
      if (vegetationArea.forest) {
        for (const forestPolygon of vegetationArea.polygons) {
          const forestBounds = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
          for (const vertex of forestPolygon[0]) {
            forestBounds[0] = Math.min(forestBounds[0], vertex[0]);
            forestBounds[1] = Math.min(forestBounds[1], vertex[1]);
            forestBounds[2] = Math.max(forestBounds[2], vertex[0]);
            forestBounds[3] = Math.max(forestBounds[3], vertex[1]);
          }
          for (
            let gridX = Math.floor(
              (Math.max(tileMinimum[0], forestBounds[0]) / localGridScale + worldGridOrigin[0]) /
                11,
            );
            gridX <=
            Math.ceil(
              (Math.min(tileMaximum[0], forestBounds[2]) / localGridScale + worldGridOrigin[0]) /
                11,
            );
            gridX++
          ) {
            for (
              let gridY = Math.floor(
                (Math.max(tileMinimum[1], forestBounds[1]) / localGridScale + worldGridOrigin[1]) /
                  11,
              );
              gridY <=
              Math.ceil(
                (Math.min(tileMaximum[1], forestBounds[3]) / localGridScale + worldGridOrigin[1]) /
                  11,
              );
              gridY++
            ) {
              const treeSeed = Math.imul(gridX, 73856093) ^ Math.imul(gridY, 19349663);
              const treePosition = [
                (gridX * 11 + this.random(treeSeed) * 6 - worldGridOrigin[0]) * localGridScale,
                (gridY * 11 + this.random(treeSeed + 1) * 6 - worldGridOrigin[1]) * localGridScale,
              ];
              if (this.contains(treePosition, forestPolygon)) {
                this.tree(
                  treePosition,
                  vegetationArea.tags,
                  `${vegetationArea.id}/${gridX}/${gridY}`,
                  'area',
                );
              }
            }
          }
        }
      }
    }
    // 缺少方向的路灯朝向最近道路，并插值得到道路高度，保留显式标注的朝向。
    for (const lamp of this.lamps) {
      let nearestRoadDistance = 30;
      for (const road of this.roads) {
        for (let segmentIndex = 1; segmentIndex < road.points.length; segmentIndex++) {
          const segmentStart = road.points[segmentIndex - 1];
          const segmentEnd = road.points[segmentIndex];
          const deltaX = segmentEnd[0] - segmentStart[0];
          const deltaY = segmentEnd[1] - segmentStart[1];
          const projectedFraction = Math.max(
            0,
            Math.min(
              1,
              ((lamp.x - segmentStart[0]) * deltaX + (lamp.y - segmentStart[1]) * deltaY) /
                (deltaX * deltaX + deltaY * deltaY),
            ),
          );
          const offsetX = segmentStart[0] + deltaX * projectedFraction - lamp.x;
          const offsetY = segmentStart[1] + deltaY * projectedFraction - lamp.y;
          const distanceToRoad = Math.hypot(offsetX, offsetY);
          if (!(distanceToRoad >= nearestRoadDistance)) {
            nearestRoadDistance = distanceToRoad;
            lamp.roadAngle = Math.atan2(offsetY, offsetX);
            lamp.z = segmentStart[2] + (segmentEnd[2] - segmentStart[2]) * projectedFraction + 0.02;
          }
        }
      }
      lamp.angle ??= lamp.roadAngle ?? 0;
    }
    // 布尔裁剪完成后再转为可转移 TypedArray，供 Worker 零拷贝交给主线程上传。
    const topologyGeometry = this.topology.build(this);
    this.buffers.markings = this.buffers.markingGround || {
      positions: [],
      colors: [],
    };
    delete this.buffers.markingGround;
    const waterPositions = new Float32Array(this.buffers.water?.positions || []);
    delete this.buffers.water;
    this.buffers.grass ||= {
      positions: [],
      colors: [],
    };
    topologyGeometry.surfaceSources.water ||= [];
    topologyGeometry.surfaceSources.grass ||= [];
    for (const surfaceBuffer of Object.values(this.buffers)) {
      surfaceBuffer.positions = new Float32Array(surfaceBuffer.positions);
      surfaceBuffer.colors = new Float32Array(surfaceBuffer.colors);
    }
    return {
      ...furnitureGeometry,
      ...topologyGeometry,
      surfaces: this.buffers,
      water: waterPositions,
      trees: this.trees,
      lamps: this.lamps,
      traffic: TrafficRoutes.build(this.roads),
      landscapeStats: this.stats,
      roadMetadata: this.roads.map((road) => ({
        id: road.id,
        width: road.width,
        lanes: road.lanes,
        inferredWidth: road.inferredWidth,
        inferredLanes: road.inferredLanes,
      })),
    };
  }
}
export { LandscapeGeometry };

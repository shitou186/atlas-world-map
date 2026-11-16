// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { Color } from 'three';
import earcut, { flatten } from 'earcut';
import { PolygonGrid } from './PolygonGrid.js';
import polygonClipping from 'polygon-clipping';
import { CoplanarClipping } from './CoplanarClipping.js';
const EARTH_RADIUS = 6378137;
const DEG_TO_RAD = Math.PI / 180;
let SkeletonBuilder;
class BuildingGeometry {
  static async init() {
    // 直骨架依赖浏览器环境的 WASM；由几何 Worker 按需加载，避免主线程初始化成本。
    const skeleton = await import('straight-skeleton');
    SkeletonBuilder = skeleton.SkeletonBuilder || skeleton.default.SkeletonBuilder;
    await SkeletonBuilder.init();
  }
  constructor(anchor) {
    // 先计算 Web Mercator 原点，再以锚点纬度的余弦将投影长度换算为局部米制坐标。
    this.anchor = anchor;
    this.originX = EARTH_RADIUS * anchor[0] * DEG_TO_RAD;
    this.originY = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (anchor[1] * DEG_TO_RAD) / 2));
    this.scale = Math.cos(anchor[1] * DEG_TO_RAD);
  }
  project(geometry) {
    // 统一 Polygon/MultiPolygon 结构；经度向锚点回绕，避免跨日期变更线时拉出长边。
    const sourcePolygons =
      geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const projectedPolygons = [];
    for (const sourcePolygon of sourcePolygons) {
      const projectedRings = [];
      for (let ringIndex = 0; ringIndex < sourcePolygon.length; ringIndex++) {
        const projectedRing = [];
        for (const coordinate of sourcePolygon[ringIndex]) {
          let longitude = coordinate[0];
          for (; longitude - this.anchor[0] > 180;) {
            longitude -= 360;
          }
          for (; longitude - this.anchor[0] < -180;) {
            longitude += 360;
          }
          const localX = (EARTH_RADIUS * longitude * DEG_TO_RAD - this.originX) * this.scale;
          const localY =
            (EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (coordinate[1] * DEG_TO_RAD) / 2)) -
              this.originY) *
            this.scale;
          if (
            !projectedRing.length ||
            projectedRing.at(-1)[0] !== localX ||
            projectedRing.at(-1)[1] !== localY
          ) {
            projectedRing.push([localX, localY]);
          }
        }
        if (!(projectedRing.length < 3)) {
          if (
            projectedRing[0][0] !== projectedRing.at(-1)[0] ||
            projectedRing[0][1] !== projectedRing.at(-1)[1]
          ) {
            projectedRing.push([...projectedRing[0]]);
          }
          // 外环逆时针、洞环顺时针，并保留闭环端点，满足裁剪与直骨架输入约定。
          if (this.ringArea(projectedRing) > 0 != (ringIndex === 0)) {
            projectedRing.reverse();
          }
          projectedRings.push(projectedRing);
        }
      }
      if (projectedRings.length) {
        projectedPolygons.push(projectedRings);
      }
    }
    return projectedPolygons;
  }
  ringArea(ring) {
    // 带符号面积用于区分外环和孔洞；闭环末点与首点重合，因此不再额外补边。
    let twiceSignedArea = 0;
    for (let vertexIndex = 0; vertexIndex < ring.length - 1; vertexIndex++) {
      twiceSignedArea +=
        ring[vertexIndex][0] * ring[vertexIndex + 1][1] -
        ring[vertexIndex + 1][0] * ring[vertexIndex][1];
    }
    return twiceSignedArea / 2;
  }
  tags(properties) {
    // 兼容 OSM 不同年代的标签别名；只规范化值，不修改外部标签键或输入对象。
    const normalizedTags = {
      ...properties,
    };
    normalizedTags['roof:shape'] ??=
      normalizedTags['building:roof:shape'] ?? normalizedTags['building:shape'];
    normalizedTags['roof:material'] ??= normalizedTags['building:roof:material'];
    normalizedTags['building:material'] =
      normalizedTags['building:facade:material'] ??
      normalizedTags['building:material'] ??
      normalizedTags.material;
    normalizedTags['building:colour'] ??=
      normalizedTags['building:color'] ?? normalizedTags.colour ?? normalizedTags.color;
    normalizedTags['roof:colour'] ??=
      normalizedTags['roof:color'] ??
      normalizedTags['building:roof:colour'] ??
      normalizedTags['building:roof:color'];
    for (const numericTag of [
      'height',
      'min_height',
      'building:levels',
      'building:min_level',
      'roof:height',
      'roof:levels',
      'roof:angle',
      'roof:direction',
      'step:height',
    ]) {
      if (typeof normalizedTags[numericTag] != 'string') {
        continue;
      }
      const numericMatch = /^\s*(-?\d+(?:\.\d+)?)\s*(m|ft|°)?\s*$/.exec(normalizedTags[numericTag]);
      if (numericMatch) {
        normalizedTags[numericTag] =
          Number(numericMatch[1]) * (numericMatch[2] === 'ft' ? 0.3048 : 1);
      }
    }
    const compassDirections = {
      N: 0,
      NNE: 22.5,
      NE: 45,
      ENE: 67.5,
      E: 90,
      ESE: 112.5,
      SE: 135,
      SSE: 157.5,
      S: 180,
      SSW: 202.5,
      SW: 225,
      WSW: 247.5,
      W: 270,
      WNW: 292.5,
      NW: 315,
      NNW: 337.5,
    };
    if (typeof normalizedTags['roof:direction'] == 'string') {
      normalizedTags['roof:direction'] =
        compassDirections[normalizedTags['roof:direction'].toUpperCase()];
    }
    for (const tagName of Object.keys(normalizedTags)) {
      if (normalizedTags[tagName] === void 0) {
        delete normalizedTags[tagName];
      }
    }
    return normalizedTags;
  }
  color(properties, roof) {
    const materialColors = {
      brick: '#ba8068',
      stone: '#d5c9ae',
      sandstone: '#d8b986',
      concrete: '#c4c3bc',
      plaster: '#e8dfca',
      wood: '#b49a73',
      glass: '#9bb8be',
      gold: '#ffd700',
      mirror: '#e7ebed',
      metal: '#a2aaa7',
      copper: '#78a390',
      slate: '#7e8587',
      roof_tiles: '#ae6c52',
      tile: '#ae6c52',
      tiles: '#ae6c52',
      thatch: '#bda574',
    };
    const taggedColor = roof ? properties['roof:colour'] : properties['building:colour'];
    const materialName = roof ? properties['roof:material'] : properties['building:material'];
    const defaultColor = roof ? '#f4f4f0' : '#e8e5da';
    const hasValidColor =
      typeof taggedColor == 'string' &&
      (/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(taggedColor) ||
        Object.hasOwn(Color.NAMES, taggedColor.toLowerCase()));
    const reflectivity =
      {
        glass: 0.3,
        gold: 0.2,
        mirror: 0.99,
      }[materialName] ?? 0.04;
    return {
      color: new Color(
        hasValidColor ? taggedColor.toLowerCase() : materialColors[materialName] || defaultColor,
      ).toArray(),
      surface: [
        reflectivity,
        reflectivity > 0.04 ? 0.12 : 0.87,
        materialName === 'gold' || materialName === 'metal' || materialName === 'copper' ? 1 : 0,
      ],
    };
  }
  triangle(firstVertex, secondVertex, thirdVertex, material) {
    // 叉积长度近零表示退化三角形，不向位置、颜色和材质三个平行缓冲区追加数据。
    const firstEdgeX = secondVertex[0] - firstVertex[0];
    const firstEdgeY = secondVertex[1] - firstVertex[1];
    const firstEdgeZ = secondVertex[2] - firstVertex[2];
    const secondEdgeX = thirdVertex[0] - firstVertex[0];
    const secondEdgeY = thirdVertex[1] - firstVertex[1];
    const secondEdgeZ = thirdVertex[2] - firstVertex[2];
    if (
      !(
        Math.hypot(
          firstEdgeY * secondEdgeZ - firstEdgeZ * secondEdgeY,
          firstEdgeZ * secondEdgeX - firstEdgeX * secondEdgeZ,
          firstEdgeX * secondEdgeY - firstEdgeY * secondEdgeX,
        ) < 1e-8
      )
    ) {
      this.positions.push(...firstVertex, ...secondVertex, ...thirdVertex);
      this.colors.push(...material.color, ...material.color, ...material.color);
      this.materials.push(...material.surface, ...material.surface, ...material.surface);
    }
  }
  face(polygon, heightAt, material, flipWinding = false) {
    // Earcut 处理带孔平面；高度函数提升到三维后，统一顶面/底面的三角形朝向。
    const flattenedPolygon = flatten(polygon);
    const triangleIndices = earcut(flattenedPolygon.vertices, flattenedPolygon.holes, 2);
    for (let triangleOffset = 0; triangleOffset < triangleIndices.length; triangleOffset += 3) {
      const triangleVertices = [];
      for (let cornerIndex = 0; cornerIndex < 3; cornerIndex++) {
        const coordinateOffset = triangleIndices[triangleOffset + cornerIndex] * 2;
        const vertexX = flattenedPolygon.vertices[coordinateOffset];
        const vertexY = flattenedPolygon.vertices[coordinateOffset + 1];
        triangleVertices.push([vertexX, vertexY, heightAt(vertexX, vertexY)]);
      }
      const reverseTriangle =
        (triangleVertices[1][0] - triangleVertices[0][0]) *
          (triangleVertices[2][1] - triangleVertices[0][1]) -
          (triangleVertices[1][1] - triangleVertices[0][1]) *
            (triangleVertices[2][0] - triangleVertices[0][0]) <
          0 !==
        flipWinding;
      this.triangle(
        triangleVertices[0],
        triangleVertices[reverseTriangle ? 2 : 1],
        triangleVertices[reverseTriangle ? 1 : 2],
        material,
      );
    }
  }
  clipScalar(polygon, minimumScalar, maximumScalar) {
    // 第三个分量在这里是待裁剪的标量，不一定是实际高度，用于切分屋顶坡面分段。
    let clippedPolygon = polygon;
    for (const boundarySign of [1, -1]) {
      const boundaryScalar = boundarySign === 1 ? minimumScalar : maximumScalar;
      const outputVertices = [];
      for (let edgeIndex = 0; edgeIndex < clippedPolygon.length; edgeIndex++) {
        const edgeStart = clippedPolygon[edgeIndex];
        const edgeEnd = clippedPolygon[(edgeIndex + 1) % clippedPolygon.length];
        const startDistance = (edgeStart[2] - boundaryScalar) * boundarySign;
        const endDistance = (edgeEnd[2] - boundaryScalar) * boundarySign;
        if (
          (startDistance >= 0 && outputVertices.push(edgeStart),
          (startDistance < 0 && endDistance > 0) || (startDistance > 0 && endDistance < 0))
        ) {
          const intersectionFraction = startDistance / (startDistance - endDistance);
          outputVertices.push([
            edgeStart[0] + (edgeEnd[0] - edgeStart[0]) * intersectionFraction,
            edgeStart[1] + (edgeEnd[1] - edgeStart[1]) * intersectionFraction,
            boundaryScalar,
          ]);
        }
      }
      clippedPolygon = outputVertices;
    }
    return clippedPolygon;
  }
  roofAxis(footprintRing, roofTags) {
    // 遍历轮廓边寻找最小面积包围矩形，再由显式方向/横向标签覆盖推断方向。
    let minimumArea = 1 / 0;
    let roofWidth = 0;
    let roofDirection = [1, 0];
    for (let edgeIndex = 0; edgeIndex < footprintRing.length - 1; edgeIndex++) {
      const edgeDeltaX = footprintRing[edgeIndex + 1][0] - footprintRing[edgeIndex][0];
      const edgeDeltaY = footprintRing[edgeIndex + 1][1] - footprintRing[edgeIndex][1];
      const edgeLength = Math.hypot(edgeDeltaX, edgeDeltaY);
      if (edgeLength < 1e-8) {
        continue;
      }
      const directionX = edgeDeltaX / edgeLength;
      const directionY = edgeDeltaY / edgeLength;
      let alongMinimum = 1 / 0;
      let alongMaximum = -1 / 0;
      let acrossMinimum = 1 / 0;
      let acrossMaximum = -1 / 0;
      for (const footprintVertex of footprintRing) {
        const alongProjection = footprintVertex[0] * directionX + footprintVertex[1] * directionY;
        const acrossProjection = -footprintVertex[0] * directionY + footprintVertex[1] * directionX;
        alongMinimum = Math.min(alongMinimum, alongProjection);
        alongMaximum = Math.max(alongMaximum, alongProjection);
        acrossMinimum = Math.min(acrossMinimum, acrossProjection);
        acrossMaximum = Math.max(acrossMaximum, acrossProjection);
      }
      const boundingArea = (alongMaximum - alongMinimum) * (acrossMaximum - acrossMinimum);
      if (boundingArea < minimumArea - 1e-7) {
        minimumArea = boundingArea;
        roofWidth = Math.min(alongMaximum - alongMinimum, acrossMaximum - acrossMinimum);
        roofDirection =
          alongMaximum - alongMinimum >= acrossMaximum - acrossMinimum
            ? [-directionY, directionX]
            : [directionX, directionY];
      }
    }
    if (roofTags['roof:orientation'] === 'across') {
      roofDirection = [-roofDirection[1], roofDirection[0]];
    }
    const taggedDirection = roofTags['roof:direction'];
    if (Number.isFinite(taggedDirection)) {
      roofDirection = [
        Math.sin(taggedDirection * DEG_TO_RAD),
        Math.cos(taggedDirection * DEG_TO_RAD),
      ];
    }
    let axisMinimum = 1 / 0;
    let axisMaximum = -1 / 0;
    for (const footprintVertex of footprintRing) {
      const axisProjection =
        footprintVertex[0] * roofDirection[0] + footprintVertex[1] * roofDirection[1];
      axisMinimum = Math.min(axisMinimum, axisProjection);
      axisMaximum = Math.max(axisMaximum, axisProjection);
    }
    return {
      x: roofDirection[0],
      y: roofDirection[1],
      min: axisMinimum,
      max: axisMaximum,
      width: roofWidth,
      middle: (axisMinimum + axisMaximum) / 2,
    };
  }
  mesh(polygons, properties, feature) {
    // 标签缺失时沿用确定性推断；inferredTags 随建筑档案返回，区分原始数据与估算。
    let roofShape =
      {
        pyramid: 'pyramidal',
        pitched: 'gabled',
        saltbox: 'double_saltbox',
        triple_saltbox: 'quadruple_saltbox',
      }[properties['roof:shape']] ||
      properties['roof:shape'] ||
      'flat';
    const inferredTags = [];
    if (
      ![
        'flat',
        'hipped',
        'gabled',
        'skillion',
        'pyramidal',
        'gambrel',
        'mansard',
        'round',
        'dome',
        'onion',
        'double_saltbox',
        'quadruple_saltbox',
        'half-hipped',
        'sawtooth',
      ].includes(roofShape)
    ) {
      this.warnings.push({
        id: feature.id,
        code: 'unsupported-roof',
        message: `\u5C4B\u9876\u5F62\u72B6 ${roofShape} \u4F7F\u7528\u5E73\u9762\u8FD1\u4F3C`,
      });
      this.stats.unsupported++;
      roofShape = 'flat';
      inferredTags.push('roof:shape');
    }
    const profileBreakPosition = 0.35;
    const profileBreakHeight = 0.75;
    if (roofShape === 'gambrel' || roofShape === 'mansard') {
      inferredTags.push('roof:break:position', 'roof:break:height');
      feature.roofProfile = {
        breakPosition: profileBreakPosition,
        breakHeight: profileBreakHeight,
        source: 'rule',
      };
    }
    if (roofShape === 'double_saltbox' || roofShape === 'quadruple_saltbox') {
      inferredTags.push('roof:break:position');
      feature.roofProfile = {
        breakPosition: 0.5,
        source: 'rule',
      };
    }
    if (roofShape === 'half-hipped') {
      inferredTags.push('roof:hip:height');
      feature.roofProfile = {
        hipHeight: 0.55,
        source: 'rule',
      };
    }
    if (roofShape === 'onion') {
      inferredTags.push('roof:bulge');
      feature.roofProfile = {
        bulge: 1.12,
        source: 'rule',
      };
    }
    let minimumHeight = properties.min_height;
    if (!Number.isFinite(minimumHeight)) {
      minimumHeight = properties['building:min_level'] * 3;
      if (Number.isFinite(minimumHeight)) {
        inferredTags.push('min_height');
      }
    }
    if (!Number.isFinite(minimumHeight)) {
      minimumHeight = 0;
    }
    let buildingHeight = properties.height;
    const heightFromLevels =
      !Number.isFinite(buildingHeight) && Number.isFinite(properties['building:levels']);
    if (
      (heightFromLevels &&
        ((buildingHeight = properties['building:levels'] * 3), inferredTags.push('height')),
      !Number.isFinite(buildingHeight))
    ) {
      let featureHash = 2166136261;
      for (const character of feature.id) {
        featureHash = Math.imul(featureHash ^ character.charCodeAt(0), 16777619);
      }
      buildingHeight = minimumHeight + 6 + ((featureHash >>> 0) % 4) * 3;
      inferredTags.push('height');
    }
    const footprintAxis = this.roofAxis(polygons[0][0], properties);
    let roofHeight = properties['roof:height'];
    if (
      (!Number.isFinite(roofHeight) &&
        roofShape !== 'flat' &&
        ((roofHeight = properties['roof:levels'] * 3),
        Number.isFinite(roofHeight) && inferredTags.push('roof:height')),
      roofShape === 'flat')
    ) {
      roofHeight = 0;
    } else if (!Number.isFinite(roofHeight)) {
      const roofAngle = properties['roof:angle'];
      if (
        Number.isFinite(roofAngle) &&
        roofAngle > 0 &&
        roofAngle < 90 &&
        ['gabled', 'skillion', 'hipped'].includes(roofShape)
      ) {
        roofHeight =
          ((footprintAxis.max - footprintAxis.min) * Math.tan(roofAngle * DEG_TO_RAD)) /
          (roofShape === 'skillion' ? 1 : 2);
      } else {
        if (['dome', 'mansard', 'gambrel', 'round'].includes(roofShape)) {
          roofHeight = footprintAxis.width / 2;
        } else {
          if (roofShape === 'skillion') {
            roofHeight = (buildingHeight * 0.25) / (heightFromLevels ? 0.75 : 1);
          } else {
            roofHeight = 4;
          }
        }
      }
      inferredTags.push('roof:height');
    }
    if (heightFromLevels) {
      buildingHeight += roofHeight;
    }
    if (!properties['roof:shape']) {
      inferredTags.push('roof:shape');
    }
    if (buildingHeight < minimumHeight) {
      if (Number.isFinite(properties.height)) {
        this.warnings.push({
          id: feature.id,
          code: 'invalid-height',
          message: '起始高度超过总高度，保留总高度并修正起始高度',
        });
        minimumHeight = Math.min(0, buildingHeight);
        inferredTags.push('min_height');
      } else {
        this.warnings.push({
          id: feature.id,
          code: 'invalid-height',
          message: '楼层推算高度低于建筑底部，保留起始高度并修正推算高度',
        });
        buildingHeight = minimumHeight + Math.max(3, roofHeight);
      }
    }
    if (roofHeight < 0 || roofHeight > buildingHeight - minimumHeight) {
      this.warnings.push({
        id: feature.id,
        code: 'invalid-roof-height',
        message: '屋顶高度超出建筑范围，按总高度与起始高度修正',
      });
      roofHeight = Math.max(0, Math.min(roofHeight, buildingHeight - minimumHeight));
      inferredTags.push('roof:height');
    }
    const skeletonsByPolygon = new Map();
    const hasTaggedOrientation =
      properties['roof:orientation'] || Number.isFinite(properties['roof:direction']);
    let needsSkeleton =
      ['hipped', 'mansard', 'quadruple_saltbox'].includes(roofShape) ||
      (!hasTaggedOrientation && ['gabled', 'gambrel', 'double_saltbox'].includes(roofShape));
    if (['pyramidal', 'pyramid', 'dome', 'onion'].includes(roofShape)) {
      for (const polygon of polygons) {
        let isConvexWithoutHoles = polygon.length === 1;
        const outerRing = polygon[0];
        for (let vertexIndex = 0; vertexIndex < outerRing.length - 1; vertexIndex++) {
          const firstVertex = outerRing[vertexIndex];
          const secondVertex = outerRing[(vertexIndex + 1) % (outerRing.length - 1)];
          const thirdVertex = outerRing[(vertexIndex + 2) % (outerRing.length - 1)];
          if (
            (secondVertex[0] - firstVertex[0]) * (thirdVertex[1] - secondVertex[1]) -
              (secondVertex[1] - firstVertex[1]) * (thirdVertex[0] - secondVertex[0]) <
            -1e-7
          ) {
            isConvexWithoutHoles = false;
          }
        }
        if (!isConvexWithoutHoles) {
          needsSkeleton = true;
          inferredTags.push('roof:geometry');
          break;
        }
      }
    }
    // 复杂坡顶先求直骨架，骨架高度随后映射到实际屋顶高度和具体轮廓曲线。
    if (needsSkeleton) {
      for (const polygon of polygons) {
        const skeleton = SkeletonBuilder.buildFromPolygon(polygon);
        if (!skeleton || !skeleton.polygons.length) {
          this.warnings.push({
            id: feature.id,
            code: 'skeleton-failed',
            message: '屋顶直骨架无法求解，使用平面近似',
          });
          roofShape = 'flat';
          inferredTags.push('roof:shape');
          skeletonsByPolygon.clear();
          break;
        }
        if (
          ((skeleton.wallFaces = new Set()),
          ['gabled', 'gambrel', 'double_saltbox'].includes(roofShape))
        ) {
          const ridgeMoves = new Map();
          let hasSharedRidge = false;
          for (const skeletonFace of skeleton.polygons) {
            if (skeletonFace.length !== 3) {
              continue;
            }
            const eaveIndices = [];
            const ridgeIndices = [];
            for (const vertexIndex of skeletonFace) {
              (skeleton.vertices[vertexIndex][2] < 0.000001 ? eaveIndices : ridgeIndices).push(
                vertexIndex,
              );
            }
            if (eaveIndices.length !== 2 || ridgeIndices.length !== 1) {
              continue;
            }
            if (ridgeMoves.has(ridgeIndices[0])) {
              hasSharedRidge = true;
              break;
            }
            const eaveStart = skeleton.vertices[eaveIndices[0]];
            const eaveEnd = skeleton.vertices[eaveIndices[1]];
            ridgeMoves.set(ridgeIndices[0], [
              (eaveStart[0] + eaveEnd[0]) / 2,
              (eaveStart[1] + eaveEnd[1]) / 2,
            ]);
            skeleton.wallFaces.add(skeletonFace);
          }
          if (hasSharedRidge || !ridgeMoves.size) {
            continue;
          }
          for (const [ridgeIndex, ridgePosition] of ridgeMoves) {
            skeleton.vertices[ridgeIndex][0] = ridgePosition[0];
            skeleton.vertices[ridgeIndex][1] = ridgePosition[1];
          }
        }
        skeletonsByPolygon.set(polygon, skeleton);
      }
    }
    if (roofShape === 'flat') {
      roofHeight = 0;
    }
    const eaveHeight = buildingHeight - roofHeight;
    const wallMaterial = this.color(properties, false);
    const roofMaterial = this.color(properties, true);
    const renderWalls = properties.building !== 'roof' && properties.wall !== 'no';
    const isSteppedRoof =
      roofShape === 'skillion' &&
      (properties['building:part'] === 'steps' || properties.building === 'steps');
    const stepHeight = properties['step:height'] > 0 ? properties['step:height'] : 0.16;
    if (isSteppedRoof && !properties['step:height']) {
      inferredTags.push('step:height');
    }
    const hasCoolingTowerProfile =
      properties.man_made === 'chimney' || properties['tower:type'] === 'cooling';
    if (hasCoolingTowerProfile) {
      inferredTags.push('building:profile');
      feature.buildingProfile = {
        waistHeight: 0.65,
        waistRadius: 0.55,
        source: 'rule',
      };
    }
    const firstPositionOffset = this.positions.length;
    for (const polygon of polygons) {
      for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
        if (this.ringArea(polygon[ringIndex]) > 0 != (ringIndex === 0)) {
          polygon[ringIndex].reverse();
        }
      }
      // 烟囱/冷却塔按高度分带缩放轮廓；各带共享同一规则以保持边界连续。
      if (hasCoolingTowerProfile) {
        const outerRing = polygon[0];
        let towerCenterX = 0;
        let towerCenterY = 0;
        for (let vertexIndex = 0; vertexIndex < outerRing.length - 1; vertexIndex++) {
          towerCenterX += outerRing[vertexIndex][0];
          towerCenterY += outerRing[vertexIndex][1];
        }
        towerCenterX /= outerRing.length - 1;
        towerCenterY /= outerRing.length - 1;
        for (let heightBandIndex = 0; heightBandIndex < 32; heightBandIndex++) {
          const lowerHeightFraction = heightBandIndex / 32;
          const upperHeightFraction = (heightBandIndex + 1) / 32;
          const lowerRadiusScale = Math.sqrt(
            0.55 ** 2 + (1 - 0.55 ** 2) * ((lowerHeightFraction - 0.65) / 0.65) ** 2,
          );
          const upperRadiusScale = Math.sqrt(
            0.55 ** 2 + (1 - 0.55 ** 2) * ((upperHeightFraction - 0.65) / 0.65) ** 2,
          );
          for (let edgeIndex = 0; edgeIndex < outerRing.length - 1; edgeIndex++) {
            const edgeStart = outerRing[edgeIndex];
            const edgeEnd = outerRing[edgeIndex + 1];
            const lowerStart = [
              towerCenterX + (edgeStart[0] - towerCenterX) * lowerRadiusScale,
              towerCenterY + (edgeStart[1] - towerCenterY) * lowerRadiusScale,
              minimumHeight + (buildingHeight - minimumHeight) * lowerHeightFraction,
            ];
            const lowerEnd = [
              towerCenterX + (edgeEnd[0] - towerCenterX) * lowerRadiusScale,
              towerCenterY + (edgeEnd[1] - towerCenterY) * lowerRadiusScale,
              lowerStart[2],
            ];
            const upperEnd = [
              towerCenterX + (edgeEnd[0] - towerCenterX) * upperRadiusScale,
              towerCenterY + (edgeEnd[1] - towerCenterY) * upperRadiusScale,
              minimumHeight + (buildingHeight - minimumHeight) * upperHeightFraction,
            ];
            const upperStart = [
              towerCenterX + (edgeStart[0] - towerCenterX) * upperRadiusScale,
              towerCenterY + (edgeStart[1] - towerCenterY) * upperRadiusScale,
              upperEnd[2],
            ];
            this.triangle(lowerStart, lowerEnd, upperEnd, wallMaterial);
            this.triangle(lowerStart, upperEnd, upperStart, wallMaterial);
          }
        }
        continue;
      }
      const roofAxis =
        roofShape === 'flat'
          ? {
              x: 1,
              y: 0,
              min: 0,
              max: 1,
            }
          : this.roofAxis(polygon[0], properties);
      const roofSkeleton = skeletonsByPolygon.get(polygon);
      const profileSegmentCount = isSteppedRoof
        ? Math.max(1, Math.ceil(roofHeight / stepHeight))
        : roofShape === 'sawtooth'
          ? Math.max(1, Math.ceil((roofAxis.max - roofAxis.min) / 6))
          : 1;
      const crossAxis = {
        x: -roofAxis.y,
        y: roofAxis.x,
        min: 1 / 0,
        max: -1 / 0,
      };
      for (const footprintVertex of polygon[0]) {
        const crossProjection = footprintVertex[0] * crossAxis.x + footprintVertex[1] * crossAxis.y;
        crossAxis.min = Math.min(crossAxis.min, crossProjection);
        crossAxis.max = Math.max(crossAxis.max, crossProjection);
      }
      const profileBreakpoints =
        roofShape === 'gambrel'
          ? [0, profileBreakPosition / 2, 0.5, 1 - profileBreakPosition / 2, 1]
          : [0, 0.5, 1];
      if (
        (roofShape === 'double_saltbox' &&
          profileBreakpoints.splice(0, profileBreakpoints.length, 0, 0.25, 0.75, 1),
        isSteppedRoof || roofShape === 'sawtooth')
      ) {
        profileBreakpoints.length = 0;
        for (let segmentIndex = 0; segmentIndex <= profileSegmentCount; segmentIndex++) {
          profileBreakpoints.push(
            isSteppedRoof
              ? Math.max(
                  0,
                  1 -
                    ((profileSegmentCount - segmentIndex) * stepHeight) /
                      (roofHeight || stepHeight),
                )
              : segmentIndex / profileSegmentCount,
          );
        }
      }
      if (roofShape === 'round') {
        profileBreakpoints.length = 0;
        for (let sampleIndex = 0; sampleIndex <= 64; sampleIndex++) {
          profileBreakpoints.push((1 - Math.cos((sampleIndex * Math.PI) / 64)) / 2);
        }
      }
      const roofHeightAt = (pointX, pointY, segmentFraction) => {
        const axisFraction = Math.max(
          0,
          Math.min(
            1,
            (pointX * roofAxis.x + pointY * roofAxis.y - roofAxis.min) /
              (roofAxis.max - roofAxis.min || 1),
          ),
        );
        if (roofSkeleton) {
          return eaveHeight;
        }
        if (isSteppedRoof) {
          return (
            eaveHeight +
            Math.min(
              roofHeight,
              Math.max(
                1,
                Math.ceil(((1 - (segmentFraction ?? axisFraction)) * roofHeight) / stepHeight),
              ) * stepHeight,
            )
          );
        }
        if (roofShape === 'sawtooth') {
          return (
            eaveHeight +
            roofHeight *
              (1 -
                (axisFraction * profileSegmentCount -
                  Math.min(
                    profileSegmentCount - 1,
                    Math.floor((segmentFraction ?? axisFraction) * profileSegmentCount),
                  )))
          );
        }
        if (roofShape === 'skillion') {
          return eaveHeight + roofHeight * (1 - axisFraction);
        }
        if (roofShape === 'gabled' || roofShape === 'pitched') {
          return eaveHeight + roofHeight * (1 - Math.abs(axisFraction * 2 - 1));
        }
        if (roofShape === 'double_saltbox') {
          return (
            eaveHeight + roofHeight * Math.min(1, Math.min(axisFraction, 1 - axisFraction) * 4)
          );
        }
        if (roofShape === 'half-hipped') {
          const crossProjection = pointX * crossAxis.x + pointY * crossAxis.y;
          const hipHeightFraction =
            0.55 +
            (Math.min(crossProjection - crossAxis.min, crossAxis.max - crossProjection) * 2) /
              (roofAxis.max - roofAxis.min);
          return (
            eaveHeight +
            roofHeight * Math.min(1 - Math.abs(axisFraction * 2 - 1), hipHeightFraction)
          );
        }
        if (roofShape === 'gambrel') {
          const ridgeFraction = 1 - Math.abs(axisFraction * 2 - 1);
          const profileHeightFraction =
            ridgeFraction <= profileBreakPosition
              ? (ridgeFraction / profileBreakPosition) * profileBreakHeight
              : profileBreakHeight +
                ((ridgeFraction - profileBreakPosition) / (1 - profileBreakPosition)) *
                  (1 - profileBreakHeight);
          return eaveHeight + roofHeight * profileHeightFraction;
        }
        if (roofShape === 'round') {
          const curveSegment = Math.min(
            63,
            Math.floor((Math.acos(1 - axisFraction * 2) / Math.PI) * 64),
          );
          const segmentStart = profileBreakpoints[curveSegment];
          const segmentEnd = profileBreakpoints[curveSegment + 1];
          const interpolationFraction = (axisFraction - segmentStart) / (segmentEnd - segmentStart);
          const curveHeightFraction =
            Math.sin((curveSegment * Math.PI) / 64) * (1 - interpolationFraction) +
            Math.sin(((curveSegment + 1) * Math.PI) / 64) * interpolationFraction;
          return eaveHeight + roofHeight * curveHeightFraction;
        }
        return eaveHeight;
      };
      if (roofSkeleton) {
        const skeleton = roofSkeleton;
        let maximumSkeletonHeight = 0;
        for (const skeletonVertex of skeleton.vertices) {
          maximumSkeletonHeight = Math.max(maximumSkeletonHeight, skeletonVertex[2]);
        }
        for (const skeletonFace of skeleton.polygons) {
          if (!renderWalls && skeleton.wallFaces.has(skeletonFace)) {
            continue;
          }
          const faceMaterial = skeleton.wallFaces.has(skeletonFace) ? wallMaterial : roofMaterial;
          const faceVertices = [];
          for (const vertexIndex of skeletonFace) {
            faceVertices.push(skeleton.vertices[vertexIndex]);
          }
          const flattenedFace = flatten([faceVertices]);
          const faceTriangleIndices = skeleton.wallFaces.has(skeletonFace)
            ? [0, 1, 2]
            : earcut(flattenedFace.vertices, flattenedFace.holes, 3);
          for (
            let triangleOffset = 0;
            triangleOffset < faceTriangleIndices.length;
            triangleOffset += 3
          ) {
            const triangleVertices = [];
            for (let cornerIndex = 0; cornerIndex < 3; cornerIndex++) {
              triangleVertices.push(
                faceVertices[faceTriangleIndices[triangleOffset + cornerIndex]],
              );
            }
            // 在折点或曲面采样高度处切分骨架三角形，防止一个面跨越不同坡度。
            const clippedBands = [];
            if (
              roofShape === 'mansard' ||
              roofShape === 'gambrel' ||
              roofShape === 'quadruple_saltbox' ||
              roofShape === 'double_saltbox'
            ) {
              const breakHeight =
                maximumSkeletonHeight *
                (roofShape.includes('saltbox') ? 0.5 : profileBreakPosition);
              clippedBands.push(
                this.clipScalar(triangleVertices, 0, breakHeight),
                this.clipScalar(triangleVertices, breakHeight, maximumSkeletonHeight),
              );
            } else if (roofShape === 'dome' || roofShape === 'onion') {
              for (let heightBandIndex = 0; heightBandIndex < 32; heightBandIndex++) {
                clippedBands.push(
                  this.clipScalar(
                    triangleVertices,
                    (maximumSkeletonHeight * heightBandIndex) / 32,
                    (maximumSkeletonHeight * (heightBandIndex + 1)) / 32,
                  ),
                );
              }
            } else {
              clippedBands.push(triangleVertices);
            }
            for (const clippedBand of clippedBands) {
              const roofVertices = [];
              for (const bandVertex of clippedBand) {
                const skeletonHeightFraction = bandVertex[2] / (maximumSkeletonHeight || 1);
                let profileHeightFraction = skeletonHeightFraction;
                if (roofShape === 'mansard' || roofShape === 'gambrel') {
                  profileHeightFraction =
                    skeletonHeightFraction <= profileBreakPosition
                      ? (skeletonHeightFraction / profileBreakPosition) * profileBreakHeight
                      : profileBreakHeight +
                        ((skeletonHeightFraction - profileBreakPosition) /
                          (1 - profileBreakPosition)) *
                          (1 - profileBreakHeight);
                }
                if (roofShape.includes('saltbox')) {
                  profileHeightFraction = Math.min(1, skeletonHeightFraction * 2);
                }
                if (roofShape === 'dome') {
                  profileHeightFraction = Math.sqrt(
                    Math.max(0, 1 - (1 - skeletonHeightFraction) ** 2),
                  );
                }
                if (roofShape === 'onion') {
                  profileHeightFraction = (1 - Math.cos(skeletonHeightFraction * Math.PI)) / 2;
                }
                roofVertices.push([
                  bandVertex[0],
                  bandVertex[1],
                  eaveHeight + roofHeight * profileHeightFraction,
                ]);
              }
              for (let fanIndex = 1; fanIndex < roofVertices.length - 1; fanIndex++) {
                const triangleOrigin = roofVertices[0];
                const triangleSecond = roofVertices[fanIndex];
                const triangleThird = roofVertices[fanIndex + 1];
                const signedTriangleArea =
                  (triangleSecond[0] - triangleOrigin[0]) * (triangleThird[1] - triangleOrigin[1]) -
                  (triangleSecond[1] - triangleOrigin[1]) * (triangleThird[0] - triangleOrigin[0]);
                this.triangle(
                  triangleOrigin,
                  signedTriangleArea < 0 ? triangleThird : triangleSecond,
                  signedTriangleArea < 0 ? triangleSecond : triangleThird,
                  faceMaterial,
                );
              }
            }
          }
        }
      } else if (['pyramidal', 'pyramid', 'dome', 'onion'].includes(roofShape)) {
        let roofCenterX = 0;
        let roofCenterY = 0;
        const outerRing = polygon[0];
        for (let vertexIndex = 0; vertexIndex < outerRing.length - 1; vertexIndex++) {
          const footprintVertex = outerRing[vertexIndex];
          roofCenterX += footprintVertex[0];
          roofCenterY += footprintVertex[1];
        }
        if (
          ((roofCenterX /= outerRing.length - 1),
          (roofCenterY /= outerRing.length - 1),
          roofShape === 'pyramidal' || roofShape === 'pyramid')
        ) {
          for (let edgeIndex = 0; edgeIndex < outerRing.length - 1; edgeIndex++) {
            this.triangle(
              [...outerRing[edgeIndex], eaveHeight],
              [...outerRing[edgeIndex + 1], eaveHeight],
              [roofCenterX, roofCenterY, buildingHeight],
              roofMaterial,
            );
          }
        } else {
          const sampledPerimeter = [];
          for (let edgeIndex = 0; edgeIndex < outerRing.length - 1; edgeIndex++) {
            const edgeStart = outerRing[edgeIndex];
            const edgeEnd = outerRing[edgeIndex + 1];
            const edgeSampleCount = Math.max(
              1,
              Math.ceil(Math.hypot(edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1]) / 0.7),
            );
            for (let sampleIndex = 0; sampleIndex < edgeSampleCount; sampleIndex++) {
              sampledPerimeter.push([
                edgeStart[0] + ((edgeEnd[0] - edgeStart[0]) * sampleIndex) / edgeSampleCount,
                edgeStart[1] + ((edgeEnd[1] - edgeStart[1]) * sampleIndex) / edgeSampleCount,
              ]);
            }
          }
          // 圆顶与洋葱顶共用周界采样，仅替换随高度变化的半径和竖直曲线。
          const curvedRoofPoint = (perimeterPoint, heightFraction) => {
            const radiusScale =
              roofShape === 'dome'
                ? Math.cos((heightFraction * Math.PI) / 2)
                : (1 - heightFraction) *
                  (1 + 2.4 * heightFraction) *
                  Math.cos((heightFraction * Math.PI) / 2);
            const verticalScale =
              roofShape === 'dome' ? Math.sin((heightFraction * Math.PI) / 2) : heightFraction;
            return [
              roofCenterX + (perimeterPoint[0] - roofCenterX) * radiusScale,
              roofCenterY + (perimeterPoint[1] - roofCenterY) * radiusScale,
              eaveHeight + roofHeight * verticalScale,
            ];
          };
          for (let heightBandIndex = 0; heightBandIndex < 48; heightBandIndex++) {
            for (
              let perimeterIndex = 0;
              perimeterIndex < sampledPerimeter.length;
              perimeterIndex++
            ) {
              const edgeStart = sampledPerimeter[perimeterIndex];
              const edgeEnd = sampledPerimeter[(perimeterIndex + 1) % sampledPerimeter.length];
              const lowerStart = curvedRoofPoint(edgeStart, heightBandIndex / 48);
              const lowerEnd = curvedRoofPoint(edgeEnd, heightBandIndex / 48);
              const upperEnd = curvedRoofPoint(edgeEnd, (heightBandIndex + 1) / 48);
              const upperStart = curvedRoofPoint(edgeStart, (heightBandIndex + 1) / 48);
              this.triangle(lowerStart, lowerEnd, upperEnd, roofMaterial);
              this.triangle(lowerStart, upperEnd, upperStart, roofMaterial);
            }
          }
        }
      } else if (roofShape === 'half-hipped') {
        const flattenedPolygon = flatten(polygon);
        const triangleIndices = earcut(flattenedPolygon.vertices, flattenedPolygon.holes, 2);
        const roofAxisLength = roofAxis.max - roofAxis.min;
        const roofPlanes = [
          [
            (2 * roofAxis.x) / roofAxisLength,
            (2 * roofAxis.y) / roofAxisLength,
            (-2 * roofAxis.min) / roofAxisLength,
          ],
          [
            (-2 * roofAxis.x) / roofAxisLength,
            (-2 * roofAxis.y) / roofAxisLength,
            (2 * roofAxis.max) / roofAxisLength,
          ],
          [
            (2 * crossAxis.x) / roofAxisLength,
            (2 * crossAxis.y) / roofAxisLength,
            0.55 - (2 * crossAxis.min) / roofAxisLength,
          ],
          [
            (-2 * crossAxis.x) / roofAxisLength,
            (-2 * crossAxis.y) / roofAxisLength,
            0.55 + (2 * crossAxis.max) / roofAxisLength,
          ],
        ];
        for (let triangleOffset = 0; triangleOffset < triangleIndices.length; triangleOffset += 3) {
          for (const activePlane of roofPlanes) {
            let clippedTriangle = [];
            for (let cornerIndex = 0; cornerIndex < 3; cornerIndex++) {
              clippedTriangle.push([
                flattenedPolygon.vertices[triangleIndices[triangleOffset + cornerIndex] * 2],
                flattenedPolygon.vertices[triangleIndices[triangleOffset + cornerIndex] * 2 + 1],
                0,
              ]);
            }
            for (const clippingPlane of roofPlanes) {
              if (activePlane !== clippingPlane) {
                for (const triangleVertex of clippedTriangle) {
                  triangleVertex[2] =
                    (clippingPlane[0] - activePlane[0]) * triangleVertex[0] +
                    (clippingPlane[1] - activePlane[1]) * triangleVertex[1] +
                    clippingPlane[2] -
                    activePlane[2];
                }
                clippedTriangle = this.clipScalar(clippedTriangle, 0, 1 / 0);
              }
            }
            for (const roofVertex of clippedTriangle) {
              roofVertex[2] =
                eaveHeight +
                roofHeight *
                  (activePlane[0] * roofVertex[0] +
                    activePlane[1] * roofVertex[1] +
                    activePlane[2]);
            }
            for (let fanIndex = 1; fanIndex < clippedTriangle.length - 1; fanIndex++) {
              this.triangle(
                clippedTriangle[0],
                clippedTriangle[fanIndex],
                clippedTriangle[fanIndex + 1],
                roofMaterial,
              );
            }
          }
        }
      } else if (
        isSteppedRoof ||
        ['gabled', 'gambrel', 'round', 'double_saltbox', 'sawtooth'].includes(roofShape)
      ) {
        const flattenedPolygon = flatten(polygon);
        const triangleIndices = earcut(flattenedPolygon.vertices, flattenedPolygon.holes, 2);
        for (let triangleOffset = 0; triangleOffset < triangleIndices.length; triangleOffset += 3) {
          const triangleVertices = [];
          let triangleMinimum = 1;
          let triangleMaximum = 0;
          for (let cornerIndex = 0; cornerIndex < 3; cornerIndex++) {
            const coordinateOffset = triangleIndices[triangleOffset + cornerIndex] * 2;
            const pointX = flattenedPolygon.vertices[coordinateOffset];
            const pointY = flattenedPolygon.vertices[coordinateOffset + 1];
            const axisFraction = Math.max(
              0,
              Math.min(
                1,
                (pointX * roofAxis.x + pointY * roofAxis.y - roofAxis.min) /
                  (roofAxis.max - roofAxis.min || 1),
              ),
            );
            triangleVertices.push([pointX, pointY, axisFraction]);
            triangleMinimum = Math.min(triangleMinimum, axisFraction);
            triangleMaximum = Math.max(triangleMaximum, axisFraction);
          }
          for (
            let profileSegmentIndex = 0;
            profileSegmentIndex < profileBreakpoints.length - 1;
            profileSegmentIndex++
          ) {
            const segmentStart = profileBreakpoints[profileSegmentIndex];
            const segmentEnd = profileBreakpoints[profileSegmentIndex + 1];
            if (triangleMaximum <= segmentStart || triangleMinimum >= segmentEnd) {
              continue;
            }
            const clippedBand = this.clipScalar(triangleVertices, segmentStart, segmentEnd);
            const roofVertices = [];
            for (const bandVertex of clippedBand) {
              roofVertices.push([
                bandVertex[0],
                bandVertex[1],
                roofHeightAt(bandVertex[0], bandVertex[1], (segmentStart + segmentEnd) / 2),
              ]);
            }
            for (let fanIndex = 1; fanIndex < roofVertices.length - 1; fanIndex++) {
              const triangleOrigin = roofVertices[0];
              const triangleSecond = roofVertices[fanIndex];
              const triangleThird = roofVertices[fanIndex + 1];
              const signedTriangleArea =
                (triangleSecond[0] - triangleOrigin[0]) * (triangleThird[1] - triangleOrigin[1]) -
                (triangleSecond[1] - triangleOrigin[1]) * (triangleThird[0] - triangleOrigin[0]);
              this.triangle(
                triangleOrigin,
                signedTriangleArea < 0 ? triangleThird : triangleSecond,
                signedTriangleArea < 0 ? triangleSecond : triangleThird,
                roofMaterial,
              );
            }
          }
          if (isSteppedRoof || roofShape === 'sawtooth') {
            for (
              let profileBreakIndex = 1;
              profileBreakIndex < profileBreakpoints.length - 1;
              profileBreakIndex++
            ) {
              const breakFraction = profileBreakpoints[profileBreakIndex];
              const breakIntersections = [];
              for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                const edgeStart = triangleVertices[edgeIndex];
                const edgeEnd = triangleVertices[(edgeIndex + 1) % 3];
                if (
                  (edgeStart[2] === breakFraction && breakIntersections.push(edgeStart),
                  (edgeStart[2] - breakFraction) * (edgeEnd[2] - breakFraction) < 0)
                ) {
                  const intersectionFraction =
                    (breakFraction - edgeStart[2]) / (edgeEnd[2] - edgeStart[2]);
                  breakIntersections.push([
                    edgeStart[0] + (edgeEnd[0] - edgeStart[0]) * intersectionFraction,
                    edgeStart[1] + (edgeEnd[1] - edgeStart[1]) * intersectionFraction,
                    breakFraction,
                  ]);
                }
              }
              if (
                breakIntersections.length !== 2 ||
                triangleMinimum === breakFraction ||
                triangleMaximum === breakFraction
              ) {
                continue;
              }
              const breakStart = breakIntersections[0];
              const breakEnd = breakIntersections[1];
              const previousSegmentMiddle =
                (profileBreakpoints[profileBreakIndex - 1] + breakFraction) / 2;
              const nextSegmentMiddle =
                (breakFraction + profileBreakpoints[profileBreakIndex + 1]) / 2;
              const lowerStart = [
                breakStart[0],
                breakStart[1],
                roofHeightAt(breakStart[0], breakStart[1], previousSegmentMiddle),
              ];
              const lowerEnd = [
                breakEnd[0],
                breakEnd[1],
                roofHeightAt(breakEnd[0], breakEnd[1], previousSegmentMiddle),
              ];
              const upperEnd = [
                breakEnd[0],
                breakEnd[1],
                roofHeightAt(breakEnd[0], breakEnd[1], nextSegmentMiddle),
              ];
              const upperStart = [
                breakStart[0],
                breakStart[1],
                roofHeightAt(breakStart[0], breakStart[1], nextSegmentMiddle),
              ];
              this.triangle(lowerStart, lowerEnd, upperEnd, roofMaterial);
              this.triangle(lowerStart, upperEnd, upperStart, roofMaterial);
            }
          }
        }
      } else {
        this.face(
          polygon,
          roofShape === 'flat' ? () => buildingHeight : roofHeightAt,
          roofMaterial,
        );
      }
      // 墙边按屋顶折点再次分段，使上沿与屋顶严格贴合；架空建筑额外补底面。
      if (renderWalls) {
        if (minimumHeight > 0) {
          this.face(polygon, () => minimumHeight, wallMaterial, true);
        }
        for (const wallRing of polygon) {
          for (let wallEdgeIndex = 0; wallEdgeIndex < wallRing.length - 1; wallEdgeIndex++) {
            const edgeStart = wallRing[wallEdgeIndex];
            const edgeEnd = wallRing[wallEdgeIndex + 1];
            const edgeBreakpoints = [0, 1];
            const startProjection = edgeStart[0] * roofAxis.x + edgeStart[1] * roofAxis.y;
            const endProjection = edgeEnd[0] * roofAxis.x + edgeEnd[1] * roofAxis.y;
            if (
              !roofSkeleton &&
              (isSteppedRoof ||
                [
                  'gabled',
                  'gambrel',
                  'round',
                  'double_saltbox',
                  'half-hipped',
                  'sawtooth',
                ].includes(roofShape)) &&
              Math.abs(endProjection - startProjection) > 1e-8
            ) {
              for (
                let roofBreakIndex = 1;
                roofBreakIndex < profileBreakpoints.length - 1;
                roofBreakIndex++
              ) {
                const intersectionFraction =
                  (roofAxis.min +
                    (roofAxis.max - roofAxis.min) * profileBreakpoints[roofBreakIndex] -
                    startProjection) /
                  (endProjection - startProjection);
                if (intersectionFraction > 1e-8 && intersectionFraction < 1 - 1e-8) {
                  edgeBreakpoints.push(intersectionFraction);
                }
              }
            }
            if (roofShape === 'half-hipped') {
              const roofAxisLength = roofAxis.max - roofAxis.min;
              const planeHeightsAt = (point) => [
                (2 * (point[0] * roofAxis.x + point[1] * roofAxis.y - roofAxis.min)) /
                  roofAxisLength,
                (2 * (roofAxis.max - point[0] * roofAxis.x - point[1] * roofAxis.y)) /
                  roofAxisLength,
                0.55 +
                  (2 * (point[0] * crossAxis.x + point[1] * crossAxis.y - crossAxis.min)) /
                    roofAxisLength,
                0.55 +
                  (2 * (crossAxis.max - point[0] * crossAxis.x - point[1] * crossAxis.y)) /
                    roofAxisLength,
              ];
              const startPlaneHeights = planeHeightsAt(edgeStart);
              const endPlaneHeights = planeHeightsAt(edgeEnd);
              for (let firstPlaneIndex = 0; firstPlaneIndex < 4; firstPlaneIndex++) {
                for (
                  let secondPlaneIndex = firstPlaneIndex + 1;
                  secondPlaneIndex < 4;
                  secondPlaneIndex++
                ) {
                  const startPlaneDifference =
                    startPlaneHeights[firstPlaneIndex] - startPlaneHeights[secondPlaneIndex];
                  const endPlaneDifference =
                    endPlaneHeights[firstPlaneIndex] - endPlaneHeights[secondPlaneIndex];
                  const intersectionFraction =
                    startPlaneDifference / (startPlaneDifference - endPlaneDifference);
                  if (intersectionFraction > 1e-8 && intersectionFraction < 1 - 1e-8) {
                    edgeBreakpoints.push(intersectionFraction);
                  }
                }
              }
            }
            edgeBreakpoints.sort((firstFraction, secondFraction) => firstFraction - secondFraction);
            for (
              let wallSegmentIndex = 0;
              wallSegmentIndex < edgeBreakpoints.length - 1;
              wallSegmentIndex++
            ) {
              const segmentStartFraction = edgeBreakpoints[wallSegmentIndex];
              const segmentEndFraction = edgeBreakpoints[wallSegmentIndex + 1];
              const segmentStart = [
                edgeStart[0] + (edgeEnd[0] - edgeStart[0]) * segmentStartFraction,
                edgeStart[1] + (edgeEnd[1] - edgeStart[1]) * segmentStartFraction,
              ];
              const segmentEnd = [
                edgeStart[0] + (edgeEnd[0] - edgeStart[0]) * segmentEndFraction,
                edgeStart[1] + (edgeEnd[1] - edgeStart[1]) * segmentEndFraction,
              ];
              const segmentMiddleFraction =
                (startProjection +
                  ((endProjection - startProjection) *
                    (segmentStartFraction + segmentEndFraction)) /
                    2 -
                  roofAxis.min) /
                (roofAxis.max - roofAxis.min || 1);
              const startRoofHeight =
                roofShape === 'flat'
                  ? buildingHeight
                  : roofHeightAt(...segmentStart, segmentMiddleFraction);
              const endRoofHeight =
                roofShape === 'flat'
                  ? buildingHeight
                  : roofHeightAt(...segmentEnd, segmentMiddleFraction);
              this.triangle(
                [...segmentStart, minimumHeight],
                [...segmentEnd, minimumHeight],
                [...segmentEnd, endRoofHeight],
                wallMaterial,
              );
              this.triangle(
                [...segmentStart, minimumHeight],
                [...segmentEnd, endRoofHeight],
                [...segmentStart, startRoofHeight],
                wallMaterial,
              );
            }
          }
        }
      }
    }
    const featureBounds = [1 / 0, 1 / 0, 1 / 0, -1 / 0, -1 / 0, -1 / 0];
    for (
      let positionOffset = firstPositionOffset;
      positionOffset < this.positions.length;
      positionOffset += 3
    ) {
      for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
        featureBounds[axisIndex] = Math.min(
          featureBounds[axisIndex],
          this.positions[positionOffset + axisIndex],
        );
        featureBounds[axisIndex + 3] = Math.max(
          featureBounds[axisIndex + 3],
          this.positions[positionOffset + axisIndex],
        );
      }
    }
    Object.assign(feature, {
      height: buildingHeight,
      minHeight: minimumHeight,
      roofHeight: roofHeight,
      roofShape: roofShape,
      inferred: inferredTags,
      bounds: featureBounds,
      startTriangle: firstPositionOffset / 9,
      triangleCount: (this.positions.length - firstPositionOffset) / 9,
    });
    this.stats.inferred += inferredTags.length > 0 ? 1 : 0;
    this.stats.roofs += roofShape !== 'flat' ? 1 : 0;
    return this.positions.length > firstPositionOffset;
  }
  build(features) {
    this.positions = [];
    this.colors = [];
    this.materials = [];
    this.warnings = [];
    this.stats = {
      buildings: 0,
      parts: 0,
      triangles: 0,
      inferred: 0,
      unsupported: 0,
      roofs: 0,
      orphanParts: 0,
      outlines: 0,
    };
    const buildingRecords = [];
    const renderedFeatures = [];
    for (const sourceFeature of features) {
      const normalizedTags = this.tags(sourceFeature.properties);
      const featureId = sourceFeature.id;
      if (
        !['Polygon', 'MultiPolygon'].includes(sourceFeature.geometry?.type) ||
        ((!normalizedTags.building || normalizedTags.building === 'no') &&
          (!normalizedTags['building:part'] || normalizedTags['building:part'] === 'no'))
      ) {
        continue;
      }
      const footprintPolygons = this.project(sourceFeature.geometry);
      const isPart = !!(
        normalizedTags['building:part'] && normalizedTags['building:part'] !== 'no'
      );
      const isOutline = !!(normalizedTags.building && normalizedTags.building !== 'no');
      let footprintArea = 0;
      const footprintBounds = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
      for (const polygon of footprintPolygons) {
        for (const ring of polygon) {
          footprintArea += this.ringArea(ring);
        }
        for (const vertex of polygon[0]) {
          footprintBounds[0] = Math.min(footprintBounds[0], vertex[0]);
          footprintBounds[1] = Math.min(footprintBounds[1], vertex[1]);
          footprintBounds[2] = Math.max(footprintBounds[2], vertex[0]);
          footprintBounds[3] = Math.max(footprintBounds[3], vertex[1]);
        }
      }
      if (footprintArea <= 0) {
        this.warnings.push({
          id: featureId,
          code: 'invalid-footprint',
          message: '建筑轮廓没有有效面积',
        });
        continue;
      }
      buildingRecords.push({
        id: featureId,
        tags: normalizedTags,
        part: isPart,
        outline: isOutline,
        polygons: footprintPolygons,
        area: footprintArea,
        bounds: footprintBounds,
        parts: [],
        feature: sourceFeature,
      });
    }
    const outlinePolygons = [];
    const polygonOwners = new Map();
    for (const outlineRecord of buildingRecords) {
      if (outlineRecord.outline) {
        for (const polygon of outlineRecord.polygons) {
          outlinePolygons.push(polygon);
          polygonOwners.set(polygon, outlineRecord);
        }
      }
    }
    // 空间网格先缩小候选集，再用差集判断完全包含，选择面积最小的父建筑。
    const outlineGrid = new PolygonGrid(outlinePolygons, 64);
    for (const partRecord of buildingRecords) {
      if (!partRecord.part) {
        continue;
      }
      let parentRecord = null;
      const candidateParents = new Set();
      for (const partPolygon of partRecord.polygons) {
        for (const candidatePolygon of outlineGrid.query(partPolygon[0])) {
          candidateParents.add(polygonOwners.get(candidatePolygon));
        }
      }
      for (const candidateParent of candidateParents) {
        if (!(
          candidateParent === partRecord ||
          candidateParent.area < partRecord.area ||
          (parentRecord && candidateParent.area >= parentRecord.area) ||
          partRecord.bounds[0] < candidateParent.bounds[0] - 0.000001 ||
          partRecord.bounds[1] < candidateParent.bounds[1] - 0.000001 ||
          partRecord.bounds[2] > candidateParent.bounds[2] + 0.000001 ||
          partRecord.bounds[3] > candidateParent.bounds[3] + 0.000001
        )) {
          if (
            polygonClipping.difference(partRecord.polygons, candidateParent.polygons).length === 0
          ) {
            parentRecord = candidateParent;
          }
        }
      }
      if (parentRecord) {
        const inheritedTags = {};
        for (const [tagName, tagValue] of Object.entries(parentRecord.tags)) {
          if (
            tagName.startsWith('building') ||
            tagName.startsWith('roof:') ||
            ['height', 'min_height', 'colour', 'color', 'material', 'wall'].includes(tagName)
          ) {
            inheritedTags[tagName] = tagValue;
          }
        }
        partRecord.tags = {
          ...inheritedTags,
          ...partRecord.tags,
        };
        partRecord.parent = parentRecord;
        for (const overlappingRecord of candidateParents) {
          if (
            overlappingRecord !== partRecord &&
            polygonClipping.intersection(partRecord.polygons, overlappingRecord.polygons).length
          ) {
            overlappingRecord.parts.push(partRecord);
          }
        }
      }
    }
    // 先绘制部件，再从主体轮廓扣除已经成功生成的部件，避免重叠面与重复建筑。
    for (const renderPartsFirst of [true, false]) {
      for (const buildingRecord of buildingRecords) {
        if (buildingRecord.part !== renderPartsFirst) {
          continue;
        }
        if (buildingRecord.part && !buildingRecord.outline && !buildingRecord.parent) {
          this.stats.orphanParts++;
          continue;
        }
        if (
          buildingRecord.outline &&
          (buildingRecord.tags['building:part'] === 'no' ||
            ['vertical', 'horizontal'].includes(buildingRecord.tags['building:parts']))
        ) {
          this.stats.outlines++;
          continue;
        }
        const renderedPartPolygons = [];
        if (buildingRecord.tags['building:part'] !== 'yes') {
          for (const partRecord of buildingRecord.parts) {
            if (partRecord.rendered) {
              renderedPartPolygons.push(partRecord.polygons);
            }
          }
        }
        const visibleFootprint = renderedPartPolygons.length
          ? polygonClipping.difference(buildingRecord.polygons, ...renderedPartPolygons)
          : buildingRecord.polygons;
        if (!visibleFootprint.length) {
          this.stats.outlines++;
          continue;
        }
        const renderedFeature = {
          id: buildingRecord.id,
          properties: {
            ...buildingRecord.tags,
          },
          sourceProperties: {
            ...buildingRecord.feature.properties,
          },
          part: buildingRecord.part,
          parentId: buildingRecord.parent?.id,
        };
        if (this.mesh(visibleFootprint, buildingRecord.tags, renderedFeature)) {
          buildingRecord.rendered = renderedFeature;
          renderedFeatures.push(renderedFeature);
          this.stats.buildings++;
          this.stats.parts += buildingRecord.part ? 1 : 0;
        }
      }
    }
    // 最后消除相邻建筑的共面重叠，并同步更新每栋建筑的三角形范围，供拾取使用。
    const clippedGeometry = CoplanarClipping.resolve(
      this.positions,
      this.colors,
      renderedFeatures,
      this.materials,
    );
    this.stats.triangles = clippedGeometry.positions.length / 9;
    this.stats.coplanarClipped = clippedGeometry.clipped;
    this.stats.buildings = clippedGeometry.features.length;
    this.stats.parts = clippedGeometry.features.filter(
      (renderedFeature) => renderedFeature.part,
    ).length;
    return {
      positions: new Float32Array(clippedGeometry.positions),
      colors: new Float32Array(clippedGeometry.colors),
      materials: new Float32Array(clippedGeometry.materials),
      features: clippedGeometry.features,
      warnings: this.warnings,
      stats: this.stats,
    };
  }
}
export { BuildingGeometry };

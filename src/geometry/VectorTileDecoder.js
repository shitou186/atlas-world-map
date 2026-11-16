// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
class VectorTileDecoder {
  static vegetation(bytes, tileX, tileY, zoom, bounds) {
    const tile = new VectorTile(new Pbf(new Uint8Array(bytes)));
    const features = [];
    const landcoverLayer = tile.layers.landcover;
    if (!landcoverLayer) {
      return features;
    }
    for (let featureIndex = 0; featureIndex < landcoverLayer.length; featureIndex++) {
      const tileFeature = landcoverLayer.feature(featureIndex);
      const properties = tileFeature.properties;
      if (tileFeature.type !== 3 || !['grass', 'wood'].includes(properties.class)) {
        continue;
      }
      const feature = tileFeature.toGeoJSON(tileX, tileY, zoom);
      const polygons =
        feature.geometry.type === 'Polygon'
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates;
      const featureBounds = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
      for (const polygon of polygons) {
        for (const point of polygon[0]) {
          featureBounds[0] = Math.min(featureBounds[0], point[0]);
          featureBounds[1] = Math.min(featureBounds[1], point[1]);
          featureBounds[2] = Math.max(featureBounds[2], point[0]);
          featureBounds[3] = Math.max(featureBounds[3], point[1]);
        }
      }
      if (!(
        bounds &&
        (featureBounds[2] < bounds.west ||
          featureBounds[0] > bounds.east ||
          featureBounds[3] < bounds.south ||
          featureBounds[1] > bounds.north)
      )) {
        feature.bbox = featureBounds;
        feature.id = `landcover/${zoom}/${tileX}/${tileY}/${tileFeature.id ?? featureIndex}`;
        feature.properties = {
          ...properties,
          source: 'OpenFreeMap',
          ...(properties.class === 'wood'
            ? {
                natural: 'wood',
              }
            : {
                landuse: 'grass',
              }),
        };
        if (properties.subclass === 'park') {
          feature.properties.leisure = 'park';
        }
        if (properties.subclass === 'garden') {
          feature.properties.leisure = 'garden';
        }
        features.push(feature);
      }
    }
    return features;
  }
  static bounds(tileX, tileY, zoom = 16) {
    const tileCount = 2 ** zoom;
    return {
      west: (tileX / tileCount) * 360 - 180,
      east: ((tileX + 1) / tileCount) * 360 - 180,
      north: (Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / tileCount))) * 180) / Math.PI,
      south: (Math.atan(Math.sinh(Math.PI * (1 - (2 * (tileY + 1)) / tileCount))) * 180) / Math.PI,
    };
  }
  static decode(bytes, tileX, tileY, zoom = 16) {
    const tile = new VectorTile(new Pbf(new Uint8Array(bytes)));
    const features = [];
    // 将 Streets GL 的压缩属性名映射回下游几何生成器使用的 OSM 标签名。
    const propertyMapping = {
      name: 'name',
      height: 'height',
      minHeight: 'min_height',
      levels: 'building:levels',
      minLevel: 'building:min_level',
      roofHeight: 'roof:height',
      roofLevels: 'roof:levels',
      roofType: 'roof:shape',
      roofAngle: 'roof:angle',
      roofDirection: 'roof:direction',
      roofOrientation: 'roof:orientation',
      material: 'building:material',
      roofMaterial: 'roof:material',
      facadeMaterial: 'building:facade:material',
      stepHeight: 'step:height',
      buildingParts: 'building:parts',
      width: 'width',
      lanes: 'lanes',
      lanesForward: 'lanes:forward',
      lanesBackward: 'lanes:backward',
      surface: 'surface',
      leafType: 'leaf_type',
      genus: 'genus',
      species: 'species',
      crownDiameter: 'diameter_crown',
      direction: 'direction',
      wallType: 'wall',
      fenceType: 'fence_type',
      sport: 'sport',
      windows: 'windows',
      sidewalkWidth: 'sidewalk:width',
      sidewalkLeftWidth: 'sidewalk:left:width',
      sidewalkRightWidth: 'sidewalk:right:width',
    };
    // 类型补充默认 OSM 标签，随后保留源数据中的明确属性并补齐专用字段。
    const typeTags = {
      tree: {
        natural: 'tree',
      },
      treeRow: {
        natural: 'tree_row',
      },
      streetLamp: {
        highway: 'street_lamp',
      },
      water: {
        natural: 'water',
      },
      forest: {
        landuse: 'forest',
      },
      grass: {
        landuse: 'grass',
      },
      garden: {
        leisure: 'garden',
      },
      scrub: {
        natural: 'scrub',
      },
      farmland: {
        landuse: 'farmland',
      },
      park: {
        leisure: 'park',
      },
      wood: {
        natural: 'wood',
      },
      grassland: {
        natural: 'grassland',
      },
      meadow: {
        landuse: 'meadow',
      },
      villageGreen: {
        landuse: 'village_green',
      },
      orchard: {
        landuse: 'orchard',
      },
      heath: {
        natural: 'heath',
      },
      vineyard: {
        landuse: 'vineyard',
      },
      flowerbed: {
        landuse: 'flowerbed',
      },
      parking: {
        highway: 'service',
        area: 'yes',
        amenity: 'parking',
      },
      pier: {
        highway: 'pedestrian',
        area: 'yes',
        man_made: 'pier',
      },
      wall: {
        barrier: 'wall',
      },
      fence: {
        barrier: 'fence',
      },
      pitch: {
        leisure: 'pitch',
      },
      track: {
        leisure: 'track',
      },
      busStop: {
        highway: 'bus_stop',
      },
      bench: {
        amenity: 'bench',
      },
      fountain: {
        amenity: 'fountain',
      },
      helipad: {
        aeroway: 'helipad',
      },
      construction: {
        landuse: 'construction',
      },
      brownfield: {
        landuse: 'brownfield',
      },
      playground: {
        leisure: 'playground',
      },
      statue: {
        tourism: 'artwork',
        artwork_type: 'statue',
      },
      sculpture: {
        tourism: 'artwork',
        artwork_type: 'sculpture',
      },
      memorial: {
        historic: 'memorial',
      },
    };
    for (const [layerName, layer] of Object.entries(tile.layers)) {
      for (let featureIndex = 0; featureIndex < layer.length; featureIndex++) {
        const tileFeature = layer.feature(featureIndex);
        const properties = tileFeature.properties;
        const isVegetation =
          ['tree', 'tree_row', 'wood', 'scrub', 'grassland', 'heath'].includes(
            properties.natural,
          ) ||
          [
            'forest',
            'grass',
            'meadow',
            'village_green',
            'orchard',
            'vineyard',
            'flowerbed',
          ].includes(properties.landuse) ||
          ['park', 'garden'].includes(properties.leisure);
        const isBuilding = properties.building || properties['building:part'];
        const isWaterRoute = properties.waterway || ['ferry', 'boat'].includes(properties.route);
        const isSurface =
          ['pitch', 'track', 'playground'].includes(properties.leisure) ||
          ['construction', 'brownfield', 'farmland'].includes(properties.landuse) ||
          properties.amenity === 'parking' ||
          properties.aeroway === 'helipad' ||
          properties.man_made === 'pier' ||
          (properties.highway && properties.area === 'yes');
        if (
          !isBuilding &&
          !isVegetation &&
          !isWaterRoute &&
          !isSurface &&
          !typeTags[properties.type] &&
          !['building', 'path', 'waterway', 'railway'].includes(properties.type)
        ) {
          continue;
        }
        // 由瓦片坐标还原经纬度；后续统一输出 GeoJSON 要素并拆开多线几何。
        const feature = tileFeature.toGeoJSON(tileX, tileY, zoom);
        const tags = {
          ...typeTags[properties.type],
        };
        for (const [propertyName, propertyValue] of Object.entries(properties)) {
          if (
            propertyName.includes(':') ||
            [
              'building',
              'colour',
              'material',
              'man_made',
              'wall',
              'min_height',
              'landuse',
              'natural',
              'leisure',
              'leaf_type',
              'diameter_crown',
              'waterway',
              'route',
              'boat',
              'access',
              'tunnel',
              'covered',
              'amenity',
              'aeroway',
              'highway',
              'area',
              'layer',
              'level',
              'bridge',
              'location',
            ].includes(propertyName)
          ) {
            tags[propertyName] = propertyValue;
          }
        }
        for (const [sourceProperty, targetProperty] of Object.entries(propertyMapping)) {
          if (properties[sourceProperty] !== void 0) {
            tags[targetProperty] = properties[sourceProperty];
          }
        }
        if (
          (properties.type === 'building' &&
            ((tags[properties.isPart ? 'building:part' : 'building'] ??=
              properties.buildingType || 'yes'),
            properties.color !== void 0 &&
              (tags['building:colour'] ??=
                typeof properties.color == 'number'
                  ? '#' + (properties.color & 16777215).toString(16).padStart(6, '0')
                  : properties.color),
            properties.roofColor !== void 0 &&
              (tags['roof:colour'] ??=
                typeof properties.roofColor == 'number'
                  ? '#' + (properties.roofColor & 16777215).toString(16).padStart(6, '0')
                  : properties.roofColor)),
          properties.type === 'path' &&
            ((tags.highway ??= properties.pathType),
            tileFeature.type === 3 && (tags.area = 'yes'),
            properties.oneway !== void 0 && (tags.oneway = properties.oneway ? 'yes' : 'no'),
            properties.sidewalkSide !== void 0 &&
              (tags.sidewalk = ['left', 'right', 'both'][properties.sidewalkSide]),
            properties.laneMarkings !== void 0 &&
              (tags.lane_markings = properties.laneMarkings ? 'yes' : 'no')),
          properties.type === 'waterway' && (tags.waterway ??= properties.waterwayType),
          properties.type === 'railway')
        ) {
          tags.railway = properties.railwayType;
          const gauges = properties.gauge
            ?.split(';')
            .map(Number)
            .filter((gauge) => gauge > 0);
          if (gauges?.length) {
            tags.gauge = Math.max(...gauges);
          }
        }
        if (
          ((feature.id =
            properties.osmId === void 0
              ? `${zoom}/${tileX}/${tileY}/${layerName}/${featureIndex}`
              : `${['node', 'way', 'relation'][properties.osmType]}/${properties.osmId}`),
          (feature.properties = tags),
          feature.geometry.type === 'MultiLineString')
        ) {
          for (let lineIndex = 0; lineIndex < feature.geometry.coordinates.length; lineIndex++) {
            features.push({
              ...feature,
              id: `${feature.id}/${lineIndex}`,
              geometry: {
                type: 'LineString',
                coordinates: feature.geometry.coordinates[lineIndex],
              },
            });
          }
        } else {
          features.push(feature);
        }
      }
    }
    return features;
  }
}
export { VectorTileDecoder };

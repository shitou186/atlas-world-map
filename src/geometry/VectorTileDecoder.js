// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
class VectorTileDecoder {
  static vegetation(bytes, tileX, tileY, zoom, bounds) {
    const s = new VectorTile(new Pbf(new Uint8Array(bytes)));
    const w = [];
    const t = s.layers.landcover;
    if (!t) {
      return w;
    }
    for (let y = 0; y < t.length; y++) {
      const Y = t.feature(y);
      const N = Y.properties;
      if (Y.type !== 3 || !['grass', 'wood'].includes(N.class)) {
        continue;
      }
      const a = Y.toGeoJSON(tileX, tileY, zoom);
      const K = a.geometry.type === 'Polygon' ? [a.geometry.coordinates] : a.geometry.coordinates;
      const e = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
      for (const G of K) {
        for (const J of G[0]) {
          e[0] = Math.min(e[0], J[0]);
          e[1] = Math.min(e[1], J[1]);
          e[2] = Math.max(e[2], J[0]);
          e[3] = Math.max(e[3], J[1]);
        }
      }
      if (!(
        bounds &&
        (e[2] < bounds.west || e[0] > bounds.east || e[3] < bounds.south || e[1] > bounds.north)
      )) {
        a.bbox = e;
        a.id = `landcover/${zoom}/${tileX}/${tileY}/${Y.id ?? y}`;
        a.properties = {
          ...N,
          source: 'OpenFreeMap',
          ...(N.class === 'wood'
            ? {
                natural: 'wood',
              }
            : {
                landuse: 'grass',
              }),
        };
        if (N.subclass === 'park') {
          a.properties.leisure = 'park';
        }
        if (N.subclass === 'garden') {
          a.properties.leisure = 'garden';
        }
        w.push(a);
      }
    }
    return w;
  }
  static bounds(x, y, zoom = 16) {
    const i = 2 ** zoom;
    return {
      west: (x / i) * 360 - 180,
      east: ((x + 1) / i) * 360 - 180,
      north: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / i))) * 180) / Math.PI,
      south: (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / i))) * 180) / Math.PI,
    };
  }
  static decode(bytes, tileX, tileY, zoom = 16) {
    const E = new VectorTile(new Pbf(new Uint8Array(bytes)));
    const s = [];
    const w = {
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
    const t = {
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
    for (const [y, Y] of Object.entries(E.layers)) {
      for (let N = 0; N < Y.length; N++) {
        const a = Y.feature(N);
        const K = a.properties;
        const e =
          ['tree', 'tree_row', 'wood', 'scrub', 'grassland', 'heath'].includes(K.natural) ||
          [
            'forest',
            'grass',
            'meadow',
            'village_green',
            'orchard',
            'vineyard',
            'flowerbed',
          ].includes(K.landuse) ||
          ['park', 'garden'].includes(K.leisure);
        const G = K.building || K['building:part'];
        const J = K.waterway || ['ferry', 'boat'].includes(K.route);
        const S =
          ['pitch', 'track', 'playground'].includes(K.leisure) ||
          ['construction', 'brownfield', 'farmland'].includes(K.landuse) ||
          K.amenity === 'parking' ||
          K.aeroway === 'helipad' ||
          K.man_made === 'pier' ||
          (K.highway && K.area === 'yes');
        if (
          !G &&
          !e &&
          !J &&
          !S &&
          !t[K.type] &&
          !['building', 'path', 'waterway', 'railway'].includes(K.type)
        ) {
          continue;
        }
        const U = a.toGeoJSON(tileX, tileY, zoom);
        const j = {
          ...t[K.type],
        };
        for (const [n, F] of Object.entries(K)) {
          if (
            n.includes(':') ||
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
            ].includes(n)
          ) {
            j[n] = F;
          }
        }
        for (const [n, F] of Object.entries(w)) {
          if (K[n] !== void 0) {
            j[F] = K[n];
          }
        }
        if (
          (K.type === 'building' &&
            ((j[K.isPart ? 'building:part' : 'building'] ??= K.buildingType || 'yes'),
            K.color !== void 0 &&
              (j['building:colour'] ??=
                typeof K.color == 'number'
                  ? '#' + (K.color & 16777215).toString(16).padStart(6, '0')
                  : K.color),
            K.roofColor !== void 0 &&
              (j['roof:colour'] ??=
                typeof K.roofColor == 'number'
                  ? '#' + (K.roofColor & 16777215).toString(16).padStart(6, '0')
                  : K.roofColor)),
          K.type === 'path' &&
            ((j.highway ??= K.pathType),
            a.type === 3 && (j.area = 'yes'),
            K.oneway !== void 0 && (j.oneway = K.oneway ? 'yes' : 'no'),
            K.sidewalkSide !== void 0 && (j.sidewalk = ['left', 'right', 'both'][K.sidewalkSide]),
            K.laneMarkings !== void 0 && (j.lane_markings = K.laneMarkings ? 'yes' : 'no')),
          K.type === 'waterway' && (j.waterway ??= K.waterwayType),
          K.type === 'railway')
        ) {
          j.railway = K.railwayType;
          const n = K.gauge
            ?.split(';')
            .map(Number)
            .filter((F) => F > 0);
          if (n?.length) {
            j.gauge = Math.max(...n);
          }
        }
        if (
          ((U.id =
            K.osmId === void 0
              ? `${zoom}/${tileX}/${tileY}/${y}/${N}`
              : `${['node', 'way', 'relation'][K.osmType]}/${K.osmId}`),
          (U.properties = j),
          U.geometry.type === 'MultiLineString')
        ) {
          for (let n = 0; n < U.geometry.coordinates.length; n++) {
            s.push({
              ...U,
              id: `${U.id}/${n}`,
              geometry: {
                type: 'LineString',
                coordinates: U.geometry.coordinates[n],
              },
            });
          }
        } else {
          s.push(U);
        }
      }
    }
    return s;
  }
}
export { VectorTileDecoder };

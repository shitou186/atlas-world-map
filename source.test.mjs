import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SceneCodec } from './src/models/SceneCodec.js';
import { TrafficRoutes } from './src/routes/TrafficRoutes.js';
import { VectorTileDecoder } from './src/geometry/VectorTileDecoder.js';
import { BuildingGeometry } from './src/geometry/BuildingGeometry.js';
import { MeshPacking } from './src/geometry/MeshPacking.js';
import { fixtureTile } from './tests/fixtures/vector-tile.js';

test('scene codec preserves typed arrays, shared references and original model resources', async () => {
  const positions = new Float32Array([1.25, -2, 3]);
  const data = { positions, repeated: positions, indices: new Uint16Array([0, 1, 2]) };
  const decoded = SceneCodec.decode(SceneCodec.encode(data));
  assert.deepEqual(decoded, data);
  assert.equal(decoded.positions, decoded.repeated);
  const models = SceneCodec.decode(new Uint8Array(await readFile(new URL('./public/models.bin', import.meta.url))));
  assert.ok(Object.keys(models).length > 10);
  assert.deepEqual(SceneCodec.decode(SceneCodec.encode(models)), models);
});

test('scene codec rejects corrupt input instead of exposing invalid array views', () => {
  assert.throws(() => SceneCodec.decode(new Uint8Array(4)), /头不完整/);
  const bytes = SceneCodec.encode({ data: new Float32Array([1]) });
  bytes[0] = 0;
  assert.throws(() => SceneCodec.decode(bytes), /魔数无效/);
});

test('traffic routes honor one-way restrictions and interpolate a position on the road', () => {
  const road = { id: 'way/123', tags: { highway: 'residential', oneway: 'yes' }, width: 6, lanes: 1, z: 0, points: [[0, 0], [100, 0]] };
  const routes = TrafficRoutes.build([road]);
  assert.equal(routes.length, 1);
  const point = new Float64Array(4);
  TrafficRoutes.sample(routes[0], 50, point);
  assert.equal(point[0], 50);
  assert.equal(point[3], 0);
  assert.equal(TrafficRoutes.build([{ ...road, tags: { ...road.tags, access: 'private' } }]).length, 0);
});

test('vector tile bounds cover Shanghai and wrap precisely to adjacent tiles', () => {
  const bounds = VectorTileDecoder.bounds(54883, 26776);
  assert.ok(bounds.west < 121.484 && bounds.east > 121.484);
  assert.equal(bounds.east, VectorTileDecoder.bounds(54884, 26776).west);
  assert.equal(bounds.south, VectorTileDecoder.bounds(54883, 26777).north);
  assert.deepEqual(VectorTileDecoder.decode(new Uint8Array(), 54883, 26776), []);
});

test('building source generates indexed geometry and preserves building metadata', () => {
  const builder = new BuildingGeometry([121.49, 31.24]);
  const data = builder.build([{ type: 'Feature', id: 'way/42', properties: { name: '测试建筑', building: 'yes', height: '12', 'roof:shape': 'flat' }, geometry: { type: 'Polygon', coordinates: [[[121.49,31.24],[121.4901,31.24],[121.4901,31.2401],[121.49,31.2401],[121.49,31.24]]] } }]);
  assert.ok(data.positions.length > 0);
  assert.equal(data.features.length, 1);
  assert.equal(data.features[0].id, 'way/42');
  assert.equal(data.features[0].height, 12);
  const packed = MeshPacking.geometry({ positions: data.positions, colors: data.colors, materials: data.materials }, data.features);
  assert.ok(packed.indices.length > 0);
  assert.equal(packed.normals.length, packed.positions.length);
  assert.ok([...packed.positions, ...packed.normals].every(Number.isFinite));
});

test('vector features retain the tile coordinates while iterating named MVT layers', () => {
  const features = VectorTileDecoder.decode(fixtureTile(), 54884, 26776);
  const building = features.find(feature => feature.id === 'way/42');
  assert.ok(building);
  for (const [longitude, latitude] of building.geometry.coordinates[0]) {
    assert.ok(longitude > 121.48 && longitude < 121.5);
    assert.ok(latitude > 31.23 && latitude < 31.25);
  }
});

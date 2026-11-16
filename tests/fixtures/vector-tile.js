import Pbf from 'pbf';

// Tiny deterministic MVT input exercises the real decoder, roofs, landscaping and routes.
const zigzag = value => value < 0 ? -value * 2 - 1 : value * 2;
function geometry(type, points) {
  const commands = [9, zigzag(points[0][0]), zigzag(points[0][1])];
  if (points.length > 1) {
    commands.push(((points.length - 1) << 3) | 2);
    for (let index = 1; index < points.length; index++) {
      commands.push(zigzag(points[index][0] - points[index - 1][0]), zigzag(points[index][1] - points[index - 1][1]));
    }
  }
  if (type === 3) commands.push(15);
  return commands;
}
export function fixtureTile() {
  const features = [
    { type: 3, points: [[500,500],[3300,500],[3300,3300],[500,3300]], properties: { type: 'building', name: '测试建筑', height: 20, roofType: 'hipped', roofHeight: 5, osmId: 42, osmType: 1 } },
    { type: 2, points: [[100,3600],[3900,3600]], properties: { type: 'path', pathType: 'residential', width: 8, lanes: 2, maxspeed: '30' } },
    { type: 1, points: [[3500,2000]], properties: { type: 'tree', height: 8 } },
    { type: 3, points: [[100,100],[4000,100],[4000,350],[100,350]], properties: { type: 'water' } },
    { type: 2, points: [[100,200],[4000,200]], properties: { type: 'waterway', waterwayType: 'canal', boat: 'yes' } },
    { type: 2, points: [[100,3900],[4000,3900]], properties: { type: 'railway', railwayType: 'rail', gauge: '1435' } },
  ];
  const keys = [...new Set(features.flatMap(feature => Object.keys(feature.properties)))];
  const values = [...new Set(features.flatMap(feature => Object.values(feature.properties)))];
  const writer = new Pbf();
  writer.writeMessage(3, (_, layer) => {
    layer.writeStringField(1, 'osm');
    for (const [index, feature] of features.entries()) {
      layer.writeMessage(2, (_, record) => {
        record.writeVarintField(1, index + 1);
        record.writePackedVarint(2, Object.entries(feature.properties).flatMap(([key,value]) => [keys.indexOf(key),values.indexOf(value)]));
        record.writeVarintField(3, feature.type);
        record.writePackedVarint(4, geometry(feature.type, feature.points));
      });
    }
    for (const key of keys) layer.writeStringField(3, key);
    for (const value of values) layer.writeMessage(4, (_, record) => {
      if (typeof value === 'number') record.writeVarintField(5, value);
      else record.writeStringField(1, value);
    });
    layer.writeVarintField(5, 4096);
    layer.writeVarintField(15, 2);
  });
  return Buffer.from(writer.finish());
}

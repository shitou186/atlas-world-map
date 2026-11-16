import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { localizeStyle, WUHAN, selectPlanetArchive, resolveTileSource } from './scripts/map-config.mjs';
import { createLocalMapServer } from './scripts/serve-local-map.mjs';
import { basemapOptions } from './src/map/basemap.js';

test('武汉样式完整改写所有地图资源，原始在线样式保持不变', async () => {
  const online = JSON.parse(await readFile('public/style.json', 'utf8'));
  const localized = localizeStyle(online);
  assert.equal(online.sources.openmaptiles.url, 'https://tiles.openfreemap.org/planet');
  assert.deepEqual(localized.sources.openmaptiles.tiles, ['/local-map/tiles/{z}/{x}/{y}.mvt']);
  assert.equal(localized.sources.openmaptiles.maxzoom, 14);
  assert.equal(localized.glyphs, '/local-map/fonts/ofm/{fontstack}/{range}.pbf');
  assert.equal(localized.sprite, '/local-map/sprites/ofm_f384/ofm');
  assert.ok(!JSON.stringify(localized).includes('https://tiles.openfreemap.org'));
  assert.equal(localized.sources.ne2_shaded.tiles[0], '/local-map/natural_earth/ofm/ne2sr/{z}/{x}/{y}.png');
  assert.ok(WUHAN.bounds[0] < WUHAN.center[0] && WUHAN.bounds[2] > WUHAN.center[0]);
});

test('下载版本只选择完整的全球 PMTiles 发布，忽略未完成版本', () => {
  const index = 'areas/planet/20261101/done\nareas/planet/20261101/tiles.pmtiles\nareas/planet/20261108/tiles.pmtiles\nareas/monaco/20261110/done\n';
  assert.equal(selectPlanetArchive(index), 'https://btrfs.openfreemap.com/areas/planet/20261101/tiles.pmtiles');
  assert.throws(() => selectPlanetArchive(''), /完整/);
});

test('仅本机允许本地模式；在线模式不会改变三维及搜索数据路由', () => {
  assert.equal(basemapOptions('http://localhost:5173/?basemap=local').styleUrl, '/local-map/style.json');
  assert.equal(basemapOptions('http://localhost:4173/?basemap=online').local, false);
  assert.equal(basemapOptions('https://shitou186.github.io/atlas-world-map/?basemap=local').local, false);
});

test('本地资源服务提供正确类型、HEAD、缺失提示和路径边界，不回源', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atlas-map-server-'));
  const server = createLocalMapServer({ directory, tilePort: 9 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const missing = await fetch(base + '/style.json');
    assert.equal(missing.status, 503);
    assert.match(await missing.text(), /maps:download/);
    await writeFile(path.join(directory, 'manifest.json'), '{}');
    await writeFile(path.join(directory, 'style.json'), '{"version":8}');
    await mkdir(path.join(directory, 'fonts'), {recursive:true});
    await writeFile(path.join(directory, 'fonts/test.pbf'), Buffer.from([1,2,3]));
    const style = await fetch(base + '/style.json');
    assert.equal(style.status, 200);
    assert.match(style.headers.get('content-type'), /json/);
    const glyph = await fetch(base + '/fonts/test.pbf');
    assert.deepEqual([...new Uint8Array(await glyph.arrayBuffer())], [1,2,3]);
    assert.equal((await fetch(base + '/fonts/test.pbf', {method:'HEAD'})).headers.get('content-length'), '3');
    assert.equal((await fetch(base + '/fonts/test.pbf', {method:'HEAD'})).status, 200);
    assert.equal((await fetch(base + '/%2e%2e%2fpackage.json')).status, 403);
    assert.equal((await fetch(base + '/absent.png')).status, 404);
    assert.equal((await fetch(base + '/style.json', {method:'POST'})).status, 405);
    assert.equal((await fetch(base + '/tiles/99/0/0.mvt')).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(directory,{recursive:true,force:true}); }
});

// 提取已成功但资源包阶段中断时，旧 manifest 不能覆盖新瓦片的来源。
test('更新下载中断后，重试沿用已完成瓦片的版本记录', () => {
  assert.equal(resolveTileSource({ hasTiles: true, plannedSource: 'version-B', previousSource: 'version-A' }), 'version-B');
  assert.equal(resolveTileSource({ hasTiles: true, previousSource: 'version-A' }), 'version-A');
  assert.throws(() => resolveTileSource({ hasTiles: true }), /来源记录/);
  assert.equal(basemapOptions('http://localhost:4173/?basemap=local', 'direct').available, false);
});

test('MapLibre 内联样式的资源地址解析为前端同源绝对地址', async () => {
  const { resolveLocalStyleUrls } = await import('./src/map/basemap.js');
  const style = localizeStyle(JSON.parse(await readFile('public/style.json', 'utf8')));
  const result = resolveLocalStyleUrls(style, 'http://localhost:5173/?basemap=local');
  const minimal = resolveLocalStyleUrls({ version: 8, sources: {}, layers: [] }, 'http://localhost:5173/');
  assert.equal(Object.hasOwn(minimal, 'sprite'), false);
  assert.equal(Object.hasOwn(minimal, 'glyphs'), false);
  assert.equal(minimal.sprite, undefined);
  assert.equal(minimal.glyphs, undefined);
  assert.equal(result.glyphs, 'http://localhost:5173/local-map/fonts/ofm/{fontstack}/{range}.pbf');
  assert.equal(result.sprite, 'http://localhost:5173/local-map/sprites/ofm_f384/ofm');
  assert.equal(result.sources.openmaptiles.tiles[0], 'http://localhost:5173/local-map/tiles/{z}/{x}/{y}.mvt');
  assert.equal(result.sources.ne2_shaded.tiles[0], 'http://localhost:5173/local-map/natural_earth/ofm/ne2sr/{z}/{x}/{y}.png');
});

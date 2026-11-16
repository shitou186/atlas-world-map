import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createServer } from 'vite';
import { createDevProxy } from './dev-proxy.mjs';

// Exercise the real HTTP proxy without relying on public map services being online.
test('Vite serves source and proxies binary tiles and Chinese search queries', { timeout: 30000 }, async () => {
  const requests = [];
  const tile = Buffer.from([26, 175, 2, 10, 5]);
  const upstream = http.createServer((request, response) => {
    requests.push({ url: request.url, method: request.method, headers: request.headers });
    if (request.url.startsWith('/vector/')) {
      response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'X-Tile-Cache': 'HIT' });
      response.end(tile);
    } else {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify([{ display_name: '外滩, 上海市', lon: '121.49', lat: '31.24' }]));
    }
  });
  let vite;
  try {
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const target = `http://127.0.0.1:${upstream.address().port}`;
    vite = await createServer({
      configFile: false,
      server: { host: '127.0.0.1', port: 0, proxy: createDevProxy({ tiles: target, geocode: target }) },
    });
    await vite.listen();
    const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /\/@vite\/client/);
    const source = await fetch(`${base}/src/main.js`);
    assert.equal(source.status, 200);
    assert.match(await source.text(), /AtlasApp/);
    const tileResponse = await fetch(`${base}/api/tiles/16/54884/26776`);
    assert.equal(tileResponse.status, 200);
    assert.equal(tileResponse.headers.get('x-tile-cache'), 'HIT');
    assert.deepEqual(Buffer.from(await tileResponse.arrayBuffer()), tile);
    const tileRequest = requests.shift();
    assert.equal(tileRequest.url, '/vector/16/54884/26776');
    assert.equal(tileRequest.headers.accept, 'application/octet-stream');
    assert.match(tileRequest.headers['user-agent'], /^AtlasMapReplica/);
    const searchResponse = await fetch(`${base}/api/geocode?q=${encodeURIComponent('上海 & 外滩')}&format=xml`);
    assert.equal(searchResponse.status, 200);
    assert.equal((await searchResponse.json())[0].display_name, '外滩, 上海市');
    const searchRequest = requests.shift();
    const searchUrl = new URL(searchRequest.url, target);
    assert.equal(searchUrl.pathname, '/search');
    assert.equal(searchUrl.searchParams.get('q'), '上海 & 外滩');
    assert.equal(searchUrl.searchParams.get('format'), 'jsonv2');
    assert.equal(searchUrl.searchParams.get('limit'), '5');
    assert.equal(searchUrl.searchParams.get('accept-language'), 'zh-CN');
    assert.equal(searchRequest.headers.accept, 'application/json');
    assert.match(searchRequest.headers['user-agent'], /^AtlasMapReplica/);
    const head = await fetch(`${base}/api/tiles/16/54884/26776`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(requests.shift().method, 'HEAD');
    await new Promise(resolve => upstream.close(resolve));
    const failed = await fetch(`${base}/api/geocode?q=test`);
    assert.equal(failed.status, 502);
    assert.ok((await failed.json()).error);
  } finally {
    await vite?.close();
    if (upstream.listening) await new Promise(resolve => upstream.close(resolve));
  }
});

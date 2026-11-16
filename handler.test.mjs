import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function runtime() {
  const code = await readFile(new URL('./handler.mjs', import.meta.url), 'utf8');
  const tile = new Uint8Array([26, 175, 2, 10, 5]);
  const context = vm.createContext({ assets: {}, URL, Request, Response, Headers, AbortSignal, console, fetch: async (url) => {
    const target = new URL(url);
    if (/^[\d.]+$/.test(target.hostname)) return new Response('error code: 1003', { status: 403 });
    if (target.hostname === 'tiles.streets.gl' && target.pathname === '/vector/16/54883/26776') return new Response(tile, { headers: { 'Content-Type': 'application/octet-stream' } });
    if (target.hostname === 'nominatim.openstreetmap.org' && target.searchParams.get('q') === '上海 & 外滩' && target.searchParams.get('format') === 'jsonv2') return Response.json([{ display_name: '外滩, 上海市', lon: '121.49', lat: '31.24' }]);
    return new Response('Unexpected upstream', { status: 502 });
  } });
  vm.runInContext(code.replace('export default', 'globalThis.app ='), context);
  return { app: context.app, tile };
}

test('tile requests succeed in a runtime that rejects IP fetches and preserve binary data', async () => {
  const { app, tile } = await runtime();
  const response = await app.fetch(new Request('https://atlas.test/api/tiles/16/54883/26776'));
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), tile);
});

test('search works without IP requests and preserves Chinese query characters', async () => {
  const { app } = await runtime();
  const response = await app.fetch(new Request('https://atlas.test/api/geocode?q=' + encodeURIComponent('上海 & 外滩')));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result[0].lon, '121.49');
});

test('Cloudflare root and /osm/ use the static asset root without a redirect loop', async () => {
  const code = await readFile(new URL('./cloudflare/worker.mjs', import.meta.url), 'utf8');
  const context = vm.createContext({ URL, Request, Response });
  vm.runInContext(code.replace('export default', 'globalThis.app ='), context);
  const env = { ASSETS: { fetch: async request => new URL(request.url).pathname === '/' ? new Response('<html>Atlas</html>') : Response.redirect('https://atlas.test/') } };
  for (const path of ['/', '/osm/']) {
    const response = await context.app.fetch(new Request('https://atlas.test' + path), env);
    assert.equal(response.status, 200);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function runtime({ cloudflare = false, upstreamFetch } = {}) {
  const code = await readFile(new URL(cloudflare ? './cloudflare/worker.mjs' : './handler.mjs', import.meta.url), 'utf8');
  const tile = new Uint8Array([26, 175, 2, 10, 5]);
  const context = vm.createContext({ assets: {}, URL, Request, Response, Headers, AbortSignal, console, fetch: upstreamFetch || (async (url) => {
    const target = new URL(url);
    if (/^[\d.]+$/.test(target.hostname)) return new Response('error code: 1003', { status: 403 });
    if (target.hostname === 'tiles.streets.gl' && target.pathname === '/vector/16/54883/26776') return new Response(tile, { headers: { 'Content-Type': 'application/octet-stream', 'X-Tile-Cache': 'HIT' } });
    if (target.hostname === 'nominatim.openstreetmap.org' && target.searchParams.get('q') === '上海 & 外滩' && target.searchParams.get('format') === 'jsonv2') return Response.json([{ display_name: '外滩, 上海市', lon: '121.49', lat: '31.24' }]);
    return new Response('Unexpected upstream', { status: 502 });
  }) });
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

const pagesOrigin = 'https://shitou186.github.io';
const corsEnv = { CORS_ALLOWED_ORIGINS: ' https://other.example, https://shitou186.github.io ' };
const tileUrl = 'https://atlas.test/api/tiles/16/54883/26776';

for (const cloudflare of [false, true]) {
  const deployment = cloudflare ? 'generated Cloudflare' : 'local';
  test(`${deployment} API allows configured exact origins and preserves binary GET and HEAD`, async () => {
    const { app, tile } = await runtime({ cloudflare });
    for (const method of ['GET', 'HEAD']) {
      const response = await app.fetch(new Request(tileUrl, { method, headers: { Origin: pagesOrigin } }), corsEnv);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), pagesOrigin);
      assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
      assert.equal(response.headers.get('Vary'), 'Origin');
      assert.equal(response.headers.get('Content-Type'), 'application/octet-stream');
      assert.equal(response.headers.get('X-Tile-Cache'), 'HIT');
      assert.equal(response.headers.get('Access-Control-Expose-Headers'), 'X-Tile-Cache');
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), method === 'HEAD' ? new Uint8Array() : tile);
    }
  });

  test(`${deployment} API handles preflight without fetching upstream`, async () => {
    const { app } = await runtime({ cloudflare, upstreamFetch: () => { throw new Error('Preflight must not fetch'); } });
    for (const method of ['GET', 'HEAD']) {
      const response = await app.fetch(new Request(tileUrl, { method: 'OPTIONS', headers: {
        Origin: pagesOrigin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'content-type'
      } }), corsEnv);
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), pagesOrigin);
      assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, HEAD');
      assert.match(response.headers.get('Access-Control-Allow-Headers'), /content-type/i);
      assert.equal(response.headers.get('Vary'), 'Origin');
      assert.equal(await response.text(), '');
    }
  });

  test(`${deployment} API rejects unlisted origins including lookalikes`, async () => {
    const { app } = await runtime({ cloudflare });
    for (const origin of ['https://shitou186.github.io.evil.test', 'https://shitou186.github.io:8443', 'null']) {
      for (const method of ['GET', 'OPTIONS']) {
        const response = await app.fetch(new Request(tileUrl, { method, headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } }), corsEnv);
        assert.equal(response.status, 403);
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
        assert.equal(response.headers.get('Vary'), 'Origin');
        assert.match(await response.text(), /origin/i);
      }
    }
    const unconfigured = await app.fetch(new Request(tileUrl, { headers: { Origin: pagesOrigin } }));
    assert.equal(unconfigured.status, 403);
    const wildcard = await app.fetch(new Request(tileUrl, { headers: { Origin: pagesOrigin } }), { CORS_ALLOWED_ORIGINS: '*' });
    assert.equal(wildcard.status, 403);
  });

  test(`${deployment} API keeps same-origin and server requests working without configuration`, async () => {
    const { app } = await runtime({ cloudflare });
    for (const headers of [{}, { Origin: 'https://atlas.test' }]) {
      const response = await app.fetch(new Request(tileUrl, { headers }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Vary'), 'Origin');
    }
  });

  test(`${deployment} API includes CORS on method errors and rejects unsupported preflight methods`, async () => {
    const { app } = await runtime({ cloudflare });
    for (const method of ['POST', 'OPTIONS']) {
      const response = await app.fetch(new Request(tileUrl, { method, headers: { Origin: pagesOrigin, 'Access-Control-Request-Method': 'POST' } }), corsEnv);
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), pagesOrigin);
      assert.equal(response.headers.get('Allow'), 'GET, HEAD, OPTIONS');
    }
  });

  test(`${deployment} API reports incomplete or unsupported preflight headers`, async () => {
    const { app } = await runtime({ cloudflare });
    for (const headers of [{ Origin: pagesOrigin }, { Origin: pagesOrigin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization' }]) {
      const response = await app.fetch(new Request(tileUrl, { method: 'OPTIONS', headers }), corsEnv);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), pagesOrigin);
    }
  });

  test(`${deployment} API includes CORS on upstream HTTP and connection errors`, async () => {
    for (const [upstreamFetch, status] of [[async () => new Response('Unavailable', { status: 503 }), 503], [async () => { throw new Error('Offline'); }, 502]]) {
      const { app } = await runtime({ cloudflare, upstreamFetch });
      for (const method of ['GET', 'HEAD']) {
        const response = await app.fetch(new Request(tileUrl, { method, headers: { Origin: pagesOrigin } }), corsEnv);
        assert.equal(response.status, status);
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), pagesOrigin);
        assert.equal(response.headers.get('Vary'), 'Origin');
        if (method === 'HEAD') assert.equal(await response.text(), '');
      }
    }
  });
}

test('CORS configuration leaves static assets unchanged', async () => {
  const { app } = await runtime({ cloudflare: true });
  const env = { ...corsEnv, ASSETS: { fetch: async () => new Response('<html>Atlas</html>', { headers: { 'Content-Type': 'text/html' } }) } };
  const response = await app.fetch(new Request('https://atlas.test/', { headers: { Origin: 'https://unlisted.example' } }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(response.headers.get('Vary'), null);
  assert.equal(await response.text(), '<html>Atlas</html>');
});

test('默认 Worker 配置不为 Pages 或其他站点提供跨平台代理', async () => {
  const config = JSON.parse(await readFile(new URL('./wrangler.jsonc', import.meta.url), 'utf8'));
  const { app } = await runtime();
  for (const origin of [pagesOrigin, 'http://localhost:4173', 'http://127.0.0.1:4173']) {
    const response = await app.fetch(new Request(tileUrl, { headers: { Origin: origin } }), config.vars);
    assert.equal(response.status, 403, origin);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
});

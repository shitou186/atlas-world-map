const tileUpstream = 'https://tiles.streets.gl';
export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const pathname = url.pathname === '/' || url.pathname === '/osm' || url.pathname === '/osm/' ? '/index.html' : url.pathname;
    const api = pathname.startsWith('/api/');
    const origin = request.headers.get('Origin');
    // 仅 API 使用精确来源白名单；同源和无 Origin 的服务端请求保持可用。
    const allowedOrigins = String(env.CORS_ALLOWED_ORIGINS || '').split(',').map(value => value.trim());
    const originAllowed = origin && (origin === url.origin || allowedOrigins.some(value => {
      try { return new URL(value).origin === value && value === origin; } catch { return false; }
    }));
    const respond = (body, init = {}) => {
      const headers = new Headers(init.headers);
      if (api) {
        // 错误与成功响应使用相同的 CORS 规则，避免缓存混用不同来源。
        headers.append('Vary', 'Origin');
        if (originAllowed) {
          headers.set('Access-Control-Allow-Origin', origin);
          // 跨域前端需要读取瓦片缓存指标。
          headers.set('Access-Control-Expose-Headers', 'X-Tile-Cache');
        }
      }
      return new Response(request.method === 'HEAD' ? null : body, { ...init, headers });
    };
    if (api && origin && !originAllowed) return respond('Origin not allowed', { status: 403 });
    if (api && request.method === 'OPTIONS') {
      const method = request.headers.get('Access-Control-Request-Method');
      if (!origin || !method) return respond('Preflight requires Origin and Access-Control-Request-Method', { status: 400 });
      if (method !== 'GET' && method !== 'HEAD') return respond('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS' } });
      const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
      if (requestedHeaders.some(value => !['accept', 'content-type'].includes(value))) return respond('Preflight headers not allowed; use Accept or Content-Type', { status: 400 });
      return respond(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': 'Accept, Content-Type' } });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return respond('Method not allowed', { status: 405, headers: { Allow: api ? 'GET, HEAD, OPTIONS' : 'GET, HEAD' } });
    const asset = assets[pathname];
    if (asset) {
      const bytes = Uint8Array.from(atob(asset[1]), c => c.charCodeAt(0));
      return new Response(request.method === 'HEAD' ? null : bytes, { headers: { 'Content-Type': asset[0], 'Cache-Control': pathname.endsWith('.html') ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (/^\/api\/tiles\/16\/\d{1,5}\/\d{1,5}$/.test(pathname) || pathname === '/api/geocode') {
      try {
        const search = pathname === '/api/geocode';
        const target = search ? new URL('https://nominatim.openstreetmap.org/search') : new URL(pathname.replace('/api/tiles/', '/vector/'), tileUpstream);
        if (search) {
          target.searchParams.set('q', url.searchParams.get('q') || '');
          target.searchParams.set('format', 'jsonv2');
          target.searchParams.set('limit', '5');
          target.searchParams.set('accept-language', 'zh-CN');
        }
        const response = await fetch(target.toString(), { headers: { Accept: search ? 'application/json' : 'application/octet-stream', 'User-Agent': 'AtlasMapReplica/1.0 (+https://atlas-world-map-replica.weirdopursuer.chatgpt.site)' }, signal: AbortSignal.timeout(30000) });
        const headers = new Headers();
        for (const key of ['content-type', 'cache-control', 'x-tile-cache']) if (response.headers.has(key)) headers.set(key, response.headers.get(key));
        headers.set('X-Content-Type-Options', 'nosniff');
        return respond(response.body, { status: response.status, headers });
      } catch {
        return respond(JSON.stringify({ error: '参考站的数据服务暂时无法连接，请稍后重试。' }), { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
      }
    }
    return respond('Not found', { status: 404 });
  }
};

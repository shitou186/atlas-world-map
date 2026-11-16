const tileUpstream = 'https://tiles.streets.gl';
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    const pathname = url.pathname === '/' || url.pathname === '/osm' || url.pathname === '/osm/' ? '/index.html' : url.pathname;
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
        return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
      } catch {
        return new Response(JSON.stringify({ error: '参考站的数据服务暂时无法连接，请稍后重试。' }), { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
      }
    }
    return new Response('Not found', { status: 404 });
  }
};

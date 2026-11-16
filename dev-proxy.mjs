const userAgent = 'AtlasMapReplica/1.0 (+https://atlas-world-map-replica.weirdopursuer.chatgpt.site)';

// Keep the development URLs and request policy aligned with handler.mjs.
export function createDevProxy({
  tiles = 'https://tiles.streets.gl',
  geocode = 'https://nominatim.openstreetmap.org',
  localMap = `http://127.0.0.1:${process.env.LOCAL_MAP_PORT || 8081}`,
} = {}) {
  const options = (target, accept, rewrite) => ({
    target,
    changeOrigin: true,
    proxyTimeout: 30000,
    headers: { Accept: accept, 'User-Agent': userAgent },
    rewrite,
    configure(proxy) {
      proxy.on('error', (_error, _request, response) => {
        if (!response.headersSent && typeof response.writeHead === 'function') {
          response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: '参考站的数据服务暂时无法连接，请稍后重试。' }));
        }
      });
    },
  });

  return {
    '/local-map': {
      target: localMap,
      rewrite: path => path.replace(/^\/local-map/, ''),
      configure(proxy) {
        proxy.on('error', (_error, _request, response) => {
          if (!response.headersSent) response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('武汉地图服务不可用，请先运行 pnpm maps:download 和 pnpm maps:serve');
        });
      },
    },
    '^/api/tiles/16/\\d{1,5}/\\d{1,5}(?:\\?.*)?$': options(
      tiles,
      'application/octet-stream',
      path => path.replace('/api/tiles/', '/vector/'),
    ),
    '^/api/geocode(?:\\?.*)?$': options(geocode, 'application/json', path => {
      const query = new URL(path, 'http://localhost').searchParams.get('q') || '';
      return '/search?' + new URLSearchParams({
        q: query,
        format: 'jsonv2',
        limit: '5',
        'accept-language': 'zh-CN',
      });
    }),
  };
}

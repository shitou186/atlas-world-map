// Pages 无服务端运行环境，直接访问支持 CORS 的数据源；其他部署使用本站代理。
export function createUrlResolvers({ baseUrl = '/', dataMode = 'proxy' } = {}) {
  const assetBaseUrl = baseUrl.replace(/\/+$/, '');
  if (!['proxy', 'direct'].includes(dataMode)) throw new Error('不支持的数据访问模式');
  return {
    assetUrl: (path) => `${assetBaseUrl}/${path.replace(/^\/+/, '')}`,
    apiUrl: (path) => {
      const normalizedPath = '/' + path.replace(/^\/+/, '');
      if (dataMode === 'proxy') return normalizedPath;
      const tileMatch = /^\/api\/tiles\/16\/(\d+)\/(\d+)$/.exec(normalizedPath);
      if (tileMatch) return `https://tiles.streets.gl/vector/16/${tileMatch[1]}/${tileMatch[2]}`;
      const [pathname, query = ''] = normalizedPath.split('?');
      if (pathname === '/api/geocode') {
        // 只透传搜索词，固定格式、数量和语言，与本地/Cloudflare 代理保持一致。
        const parameters = new URLSearchParams({
          q: new URLSearchParams(query).get('q') || '',
          format: 'jsonv2', limit: '5', 'accept-language': 'zh-CN',
        });
        return `https://nominatim.openstreetmap.org/search?${parameters}`;
      }
      throw new Error(`不支持的直连接口：${pathname}`);
    },
  };
}

// 模式由构建目标确定，遗留的外部 API 地址配置不再参与请求路由。
export const { assetUrl, apiUrl } = createUrlResolvers({
  baseUrl: import.meta.env?.BASE_URL || '/',
  dataMode: import.meta.env?.VITE_DATA_MODE || 'proxy',
});

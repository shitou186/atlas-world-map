// 静态资源跟随页面部署目录，API 始终使用单独配置的服务根地址。
export function createUrlResolvers({ baseUrl = '/', apiBaseUrl = '' } = {}) {
  const assetBaseUrl = baseUrl.replace(/\/+$/, '');
  const apiRootUrl = apiBaseUrl.replace(/\/+$/, '');
  return {
    assetUrl: (path) => `${assetBaseUrl}/${path.replace(/^\/+/, '')}`,
    apiUrl: (path) => `${apiRootUrl}/${path.replace(/^\/+/, '')}`,
  };
}

// Node 测试环境没有 Vite 的 import.meta.env，默认保留同源根目录行为。
export const { assetUrl, apiUrl } = createUrlResolvers({
  baseUrl: import.meta.env?.BASE_URL || '/',
  apiBaseUrl: import.meta.env?.VITE_API_BASE_URL || '',
});

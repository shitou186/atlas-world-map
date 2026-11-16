import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { createDevProxy } from './dev-proxy.mjs';

const projectRoot = fileURLToPath(new URL('./', import.meta.url));

// Pages 独立构建模式，避免发布配置污染本地服务和完整 Cloudflare 站点。
export function resolveDeployment(mode, environment = {}) {
  if (mode !== 'pages') return { basePath: '/', dataMode: 'proxy' };
  const requestedBase = (environment.VITE_BASE_PATH ?? '/atlas-world-map/').trim();
  if (
    !requestedBase.startsWith('/') ||
    requestedBase.startsWith('//') ||
    /[?#\\]/.test(requestedBase) ||
    requestedBase.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error('VITE_BASE_PATH 必须是以 / 开头的站点路径，例如 /atlas-world-map/ 或 /。');
  }
  const basePath = requestedBase.replace(/\/+$/, '') + '/';
  return { basePath, dataMode: 'direct' };
}

export default defineConfig(({ mode }) => {
  const environment = { ...loadEnv(mode, projectRoot, 'VITE_'), ...process.env };
  const deployment = resolveDeployment(mode, environment);
  return {
    base: deployment.basePath,
    define: { 'import.meta.env.VITE_DATA_MODE': JSON.stringify(deployment.dataMode) },
    server: { host: '0.0.0.0', port: 5173, proxy: createDevProxy() },
    build: { target: 'es2022', sourcemap: true, emptyOutDir: true },
    worker: { format: 'es' },
  };
});

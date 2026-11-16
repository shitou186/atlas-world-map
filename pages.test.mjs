import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeployment } from './vite.config.js';

test('本地与 Cloudflare 构建保持根路径和同源接口，不受 Pages 环境变量污染', () => {
  for (const mode of ['development', 'production']) {
    assert.deepEqual(
      resolveDeployment(mode, {
        VITE_BASE_PATH: '/atlas-world-map/',
        VITE_API_BASE_URL: 'https://external.test',
      }),
      { basePath: '/', apiBaseUrl: '' },
    );
  }
});

test('Pages 构建默认沿用确认的 Worker 和仓库目录', () => {
  assert.deepEqual(resolveDeployment('pages', {}), {
    basePath: '/atlas-world-map/',
    apiBaseUrl: 'https://atlas-world-map-20261116.weirdopursuer.workers.dev',
  });
});

test('Pages 支持自定义域名根目录、其他仓库路径及 API 网关前缀', () => {
  assert.deepEqual(
    resolveDeployment('pages', {
      VITE_BASE_PATH: '/',
      VITE_API_BASE_URL: 'https://api.test/gateway/',
    }),
    { basePath: '/', apiBaseUrl: 'https://api.test/gateway' },
  );
  assert.equal(
    resolveDeployment('pages', { VITE_BASE_PATH: '/other-repo' }).basePath,
    '/other-repo/',
  );
});

test('Pages 配置拒绝错误的路径以及不适合 HTTPS 页面的 API 地址', () => {
  for (const basePath of ['relative', '//other.test/', '/a/../b/', '/a?x=1/', '/a\\b/']) {
    assert.throws(() => resolveDeployment('pages', { VITE_BASE_PATH: basePath }), /VITE_BASE_PATH/);
  }
  for (const apiBase of [
    '',
    'invalid',
    '/api',
    'http://api.test',
    'https://user:secret@api.test',
    'https://api.test?q=1',
    'https://api.test/#x',
  ]) {
    assert.throws(
      () => resolveDeployment('pages', { VITE_API_BASE_URL: apiBase }),
      /VITE_API_BASE_URL/,
    );
  }
});

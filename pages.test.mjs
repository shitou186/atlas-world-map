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
      { basePath: '/', dataMode: 'proxy' },
    );
  }
});

test('Pages 构建使用直接数据源和仓库目录', () => {
  assert.deepEqual(resolveDeployment('pages', {}), {
    basePath: '/atlas-world-map/',
    dataMode: 'direct',
  });
});

test('Pages 支持自定义域名并忽略遗留 API 网关配置', () => {
  assert.deepEqual(
    resolveDeployment('pages', {
      VITE_BASE_PATH: '/',
      VITE_API_BASE_URL: 'https://api.test/gateway/',
    }),
    { basePath: '/', dataMode: 'direct' },
  );
  assert.equal(
    resolveDeployment('pages', { VITE_BASE_PATH: '/other-repo' }).basePath,
    '/other-repo/',
  );
});

test('Pages 配置拒绝错误的路径', () => {
  for (const basePath of ['relative', '//other.test/', '/a/../b/', '/a?x=1/', '/a\\b/']) {
    assert.throws(() => resolveDeployment('pages', { VITE_BASE_PATH: basePath }), /VITE_BASE_PATH/);
  }
});

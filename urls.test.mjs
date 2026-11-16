import assert from 'node:assert/strict';
import test from 'node:test';
import * as urlModule from './src/urls.js';

test('根目录部署和 Node 默认导出保留同源地址', () => {
  const { assetUrl, apiUrl } = urlModule.createUrlResolvers();
  assert.equal(assetUrl('/models.bin'), '/models.bin');
  assert.equal(assetUrl('style.json'), '/style.json');
  assert.equal(apiUrl('/api/tiles/16/54886/26701'), '/api/tiles/16/54886/26701');
  assert.equal(urlModule.assetUrl('/textures/GradientSky.png'), '/textures/GradientSky.png');
  assert.equal(urlModule.apiUrl('/api/geocode?q=Paris'), '/api/geocode?q=Paris');
});

test('Pages 子目录只加在静态资源地址上', () => {
  const { assetUrl, apiUrl } = urlModule.createUrlResolvers({ baseUrl: '/atlas-world-map/' });
  assert.equal(assetUrl('/style.json'), '/atlas-world-map/style.json');
  assert.equal(
    assetUrl('models/train/Textures/colormap.png'),
    '/atlas-world-map/models/train/Textures/colormap.png',
  );
  assert.equal(apiUrl('/api/geocode?q=Paris'), '/api/geocode?q=Paris');
});

test('独立 API 根地址不受 Pages 子目录影响', () => {
  const { assetUrl, apiUrl } = urlModule.createUrlResolvers({
    baseUrl: '/atlas-world-map',
    apiBaseUrl: 'https://atlas-world-map-20261116.weirdopursuer.workers.dev/',
  });
  assert.equal(assetUrl('/models/boat/boat.bis'), '/atlas-world-map/models/boat/boat.bis');
  assert.equal(
    apiUrl('api/tiles/16/54886/26701'),
    'https://atlas-world-map-20261116.weirdopursuer.workers.dev/api/tiles/16/54886/26701',
  );
});

test('API 根地址的网关前缀以及编码后的查询参数保持原样', () => {
  const queryPath = '/api/geocode?q=%E4%B8%8A%E6%B5%B7%20%26%20Paris%2F%E6%9D%B1%E4%BA%AC&limit=5';
  const absoluteGateway = urlModule.createUrlResolvers({
    apiBaseUrl: 'https://api.example.com/gateway/',
  });
  const sameOriginGateway = urlModule.createUrlResolvers({
    baseUrl: '/atlas-world-map/',
    apiBaseUrl: '/gateway/',
  });
  assert.equal(
    absoluteGateway.apiUrl(queryPath),
    'https://api.example.com/gateway/api/geocode?q=%E4%B8%8A%E6%B5%B7%20%26%20Paris%2F%E6%9D%B1%E4%BA%AC&limit=5',
  );
  assert.equal(
    sameOriginGateway.apiUrl(queryPath),
    '/gateway/api/geocode?q=%E4%B8%8A%E6%B5%B7%20%26%20Paris%2F%E6%9D%B1%E4%BA%AC&limit=5',
  );
});

test('静态资源拼接不重复斜线且保留资源参数', () => {
  const { assetUrl } = urlModule.createUrlResolvers({ baseUrl: '/atlas-world-map///' });
  assert.equal(
    assetUrl('///textures/GradientSky.png?v=a%2Fb#preview'),
    '/atlas-world-map/textures/GradientSky.png?v=a%2Fb#preview',
  );
});

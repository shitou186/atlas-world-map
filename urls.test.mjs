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

test('Pages 直连瓦片数据源，资源仍使用部署目录', () => {
  const { assetUrl, apiUrl } = urlModule.createUrlResolvers({ baseUrl: '/atlas-world-map/', dataMode: 'direct' });
  assert.equal(assetUrl('/models.bin'), '/atlas-world-map/models.bin');
  assert.equal(apiUrl('/api/tiles/16/54886/26701'), 'https://tiles.streets.gl/vector/16/54886/26701');
});

test('Pages 搜索保留中文和特殊字符，并固定上游结果格式', () => {
  const { apiUrl } = urlModule.createUrlResolvers({ dataMode: 'direct' });
  const address = new URL(apiUrl('/api/geocode?q=' + encodeURIComponent('上海 & Paris/東京') + '&limit=999'));
  assert.equal(address.origin + address.pathname, 'https://nominatim.openstreetmap.org/search');
  assert.equal(address.searchParams.get('q'), '上海 & Paris/東京');
  assert.equal(address.searchParams.get('format'), 'jsonv2');
  assert.equal(address.searchParams.get('limit'), '5');
  assert.equal(address.searchParams.get('accept-language'), 'zh-CN');
  assert.throws(() => apiUrl('/api/unknown'), /不支持/);
});

test('静态资源拼接不重复斜线且保留资源参数', () => {
  const { assetUrl } = urlModule.createUrlResolvers({ baseUrl: '/atlas-world-map///' });
  assert.equal(
    assetUrl('///textures/GradientSky.png?v=a%2Fb#preview'),
    '/atlas-world-map/textures/GradientSky.png?v=a%2Fb#preview',
  );
});

import { test, expect } from '@playwright/test';
import { fixtureTile } from './fixtures/vector-tile.js';

async function mockMapServices(page) {
  await page.route('https://*.workers.dev/**', route => route.abort());
  const tile = fixtureTile();
  const apiHeaders = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4174' };
  await page.route('**/style.json', route => route.fulfill({ json: {
    version: 8,
    sources: { openmaptiles: { type: 'vector', tiles: ['http://127.0.0.1:4174/fixture/{z}/{x}/{y}.pbf'], maxzoom: 14 } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#edece5' } },
      { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#a4c4bd' } },
    ],
  } }));
  await page.route('**/fixture/**', route => route.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf' }));
  await page.route(process.env.ATLAS_TEST_PAGES === '1' ? 'https://tiles.streets.gl/vector/16/**' : '**/api/tiles/**', route => route.fulfill({ headers: apiHeaders, body: tile, contentType: 'application/x-protobuf' }));
  await page.route(process.env.ATLAS_TEST_PAGES === '1' ? 'https://nominatim.openstreetmap.org/search?**' : '**/api/geocode?**', route => route.fulfill({ headers: apiHeaders, json: [
    { display_name: '外滩, 上海市', lon: '121.49', lat: '31.24' },
    { display_name: 'Invalid coordinates', lon: '200', lat: '90' },
  ] }));
}

test('production source build renders 3D tiles and preserves map controls and search', async ({ page }) => {
  const errors = [];
  const requestUrls = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requestUrls.push(request.url()));
  await mockMapServices(page);
  await page.goto('./?profile');
  const canvas = page.locator('.maplibregl-canvas');
  await expect.poll(() => canvas.getAttribute('data-scene-frames'), { timeout: 45000 }).not.toBeNull();
  await expect.poll(async () => Number(await page.locator('#building-count').textContent()), { timeout: 45000 }).toBeGreaterThan(0);
  await expect.poll(async () => Number(await canvas.getAttribute('data-scene-triangles')), { timeout: 45000 }).toBeGreaterThan(0);
  await expect(canvas).toHaveAttribute('data-view-mode', '3d');
  await expect(page.locator('#interaction-metrics')).toHaveCount(1);
  await page.locator('#motion').uncheck();
  await canvas.click({ position: { x: 720, y: 500 } });
  await expect(page.locator('#feature-card')).toBeVisible();
  await expect(page.locator('#feature-name')).toHaveText('测试建筑');
  await page.locator('#close-feature').click();
  await page.screenshot({ path: 'test-results/atlas-desktop.png' });
  await page.locator('#sun-time').fill('18.5');
  await page.locator('#sun-time').dispatchEvent('input');
  await expect(page.locator('#time-label')).toHaveText('18:30');
  await page.locator('#map-pitch').fill('40');
  await page.locator('#map-pitch').dispatchEvent('input');
  await expect(page.locator('#pitch-label')).toHaveText('40°');
  for (const id of ['buildings','vegetation','roads','lamps','traffic','traffic-motion','boats','trains','motion','wind','shadows','labels']) {
    await page.locator(`#${id}`).uncheck();
    await expect(page.locator(`#${id}`)).not.toBeChecked();
    await page.locator(`#${id}`).check();
  }
  await page.locator('#tree-detail').selectOption('full');
  await page.locator('#replay').click();
  await page.locator('#vector-toggle').click();
  await expect(canvas).toHaveAttribute('data-ground-mode', 'hidden');
  await page.locator('#vector-toggle').click();
  await page.locator('#scene-toggle').click();
  await expect(canvas).toHaveAttribute('data-view-mode', '2d');
  await page.locator('#scene-toggle').click();
  await expect(canvas).toHaveAttribute('data-view-mode', '3d');
  await page.locator('#location').fill('上海 & 外滩');
  await page.locator('#location-form').evaluate(form => form.requestSubmit());
  await expect(page.locator('#location-options button')).toHaveCount(1);
  await page.getByRole('button', { name: '外滩, 上海市' }).click();
  await expect(page.locator('#location-results')).toBeHidden();
  await page.locator('[data-place="tokyo"]').click();
  await expect(page.locator('[data-place="tokyo"]')).toHaveClass('active');
  if (process.env.ATLAS_TEST_PAGES === '1') {
    expect(requestUrls.some(url => url.startsWith('https://tiles.streets.gl/vector/16/'))).toBe(true);
    expect(requestUrls.some(url => url.startsWith('https://nominatim.openstreetmap.org/search?'))).toBe(true);
    expect(requestUrls.filter(url => new URL(url).hostname.endsWith('.workers.dev'))).toEqual([]);
    expect(requestUrls.filter(url => new URL(url).pathname.startsWith('/api/'))).toEqual([]);
    const escapedAssets = requestUrls.filter(url => /^http:\/\/127\.0\.0\.1:4174\/(?:assets\/|models(?:\/|\.bin)|textures\/|style\.json)/.test(url));
    if ((process.env.VITE_BASE_PATH || '/atlas-world-map/') !== '/') expect(escapedAssets).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('mobile settings, search and Escape preserve responsive behavior', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMapServices(page);
  await page.goto('./osm/');
  await expect(page.locator('#settings')).toBeHidden();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
  await page.locator('#panel-toggle').click();
  await expect(page.locator('#settings')).toBeVisible();
  await page.locator('#location').focus();
  await expect(page.locator('#settings')).toBeHidden();
  await page.locator('#location').fill('上海');
  await page.locator('#location-form').evaluate(form => form.requestSubmit());
  await expect(page.locator('#location-options button')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#location-results')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/atlas-mobile.png' });
});

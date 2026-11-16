import { test, expect } from '@playwright/test';
import { mkdir, writeFile, rm } from 'node:fs/promises';

test('development updates CSS and JavaScript over the Vite HMR connection', async ({ page }) => {
  test.skip(process.env.ATLAS_TEST_DEV !== '1', 'Requires the Vite development server');
  // Vite intentionally ignores test-results; put this temporary probe beside real source.
  const directory = `src/hmr-probe-${Date.now()}`;
  const stylesheet = `${directory}/probe.css`;
  const module = `${directory}/probe.js`;
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(stylesheet, '#hmr-label { color: rgb(1, 2, 3); }');
    const source = version => `import './probe.css';\ndocument.querySelector('#hmr-label').textContent = '${version}';\nif (import.meta.hot) import.meta.hot.accept();\n`;
    await writeFile(module, source('first'));
    // Serve actual HTML so Chromium classifies the page and HMR socket as local.
    await writeFile(`${directory}/index.html`, `<div id="hmr-label"></div><script type="module" src="/${module}"></script>`);
    await page.goto(`/${directory}/index.html`);
    const label = page.locator('#hmr-label');
    await expect(label).toHaveText('first');
    await expect(label).toHaveCSS('color', 'rgb(1, 2, 3)');
    await page.evaluate(() => { globalThis.hmrPageMarker = 'retained'; });
    await writeFile(stylesheet, '#hmr-label { color: rgb(4, 5, 6); }');
    await expect(label).toHaveCSS('color', 'rgb(4, 5, 6)');
    await writeFile(module, source('updated'));
    await expect(label).toHaveText('updated');
    expect(await page.evaluate(() => globalThis.hmrPageMarker)).toBe('retained');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

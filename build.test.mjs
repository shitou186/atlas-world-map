import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('./', import.meta.url));

test('a clean source copy rebuilds frontend, Worker, models, Node and Cloudflare outputs', { timeout: 120000 }, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'atlas-clean-build-'));
  const excluded = new Set(['dist', 'cloudflare', 'node_modules', '.git', '.wrangler', '.openai', '.sites-runtime', 'test-results', 'playwright-report']);
  try {
    await cp(root, temporary, {
      recursive: true,
      filter: source => !excluded.has(path.relative(root, source).split(path.sep)[0]),
    });
    await symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
    const manifest = JSON.parse(await readFile(path.join(temporary, 'package.json'), 'utf8'));
    await execute('npm', ['run', 'build'], { cwd: temporary, timeout: 90000, maxBuffer: 2 ** 20 });
    const html = await readFile(path.join(temporary, 'dist/index.html'), 'utf8');
    assert.match(html, /Atlas/);
    const assets = await readdir(path.join(temporary, 'dist/assets'));
    assert.ok(assets.some(name => /geometry.*\.js$/.test(name)), 'geometry Worker is built from source');
    assert.ok(assets.some(name => /\.css$/.test(name)), 'styles are built from source');
    assert.ok(manifest.dependencies?.['three'], 'rendering libraries are declared dependencies');
    const { default: app } = await import(pathToFileURL(path.join(temporary, 'dist/server/index.js')));
    for (const route of ['/', '/osm/', '/style.json', '/models.bin', '/models/boat/boat.bis', '/models/train/models.bin', '/textures/GradientSky.png']) {
      const response = await app.fetch(new Request(`http://atlas.test${route}`));
      assert.equal(response.status, 200, route);
      const bytes = new Uint8Array(await response.arrayBuffer());
      assert.ok(bytes.length > 0, route);
      if (route.endsWith('.bin') || route.endsWith('.bis') || route.endsWith('.png')) {
        assert.deepEqual(bytes, new Uint8Array(await readFile(path.join(temporary, 'public', route))));
      }
    }
    for (const reference of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
      const response = await app.fetch(new Request(`http://atlas.test${reference[1]}`));
      assert.equal(response.status, 200, reference[1]);
    }
    assert.equal((await app.fetch(new Request('http://atlas.test/missing'))).status, 404);
    assert.equal((await app.fetch(new Request('http://atlas.test/', { method: 'HEAD' }))).body, null);
    assert.ok((await readFile(path.join(temporary, 'cloudflare/worker.mjs'), 'utf8')).includes('env.ASSETS.fetch'));
    assert.equal(await readFile(path.join(temporary, 'cloudflare/assets/index.html'), 'utf8'), html);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Pages 从干净源码构建子目录静态站点，API 独立且不包含 Node/Cloudflare 运行文件', { timeout: 120000 }, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'atlas-pages-build-'));
  const excluded = new Set(['dist', 'cloudflare', 'node_modules', '.git', '.wrangler', '.openai', '.sites-runtime', 'test-results', 'playwright-report']);
  try {
    await cp(root, temporary, { recursive: true, filter: source => !excluded.has(path.relative(root, source).split(path.sep)[0]) });
    await symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
    // CI 先执行完整测试再构建 Pages，必须清理此前留下的 Node 服务产物。
    await mkdir(path.join(temporary, 'dist/server'), { recursive: true });
    await writeFile(path.join(temporary, 'dist/server/index.js'), 'export default null;');
    await execute('npm', ['run', 'build:pages'], { cwd: temporary, timeout: 90000, maxBuffer: 2 ** 20, env: {
      ...process.env, VITE_BASE_PATH: '/atlas-world-map/', VITE_API_BASE_URL: 'https://api.atlas.test/gateway/',
    } });
    const html = await readFile(path.join(temporary, 'dist/index.html'), 'utf8');
    assert.match(html, /src="\/atlas-world-map\/assets\//);
    assert.match(html, /href="\/atlas-world-map\/assets\//);
    assert.equal(await readFile(path.join(temporary, 'dist/osm/index.html'), 'utf8'), html);
    assert.equal(await readFile(path.join(temporary, 'dist/.nojekyll'), 'utf8'), '');
    await assert.rejects(readFile(path.join(temporary, 'dist/server/index.js')), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(temporary, 'cloudflare/worker.mjs')), { code: 'ENOENT' });
    const names = await readdir(path.join(temporary, 'dist/assets'));
    assert.ok(names.some(name => /geometry.*\.js$/.test(name)));
    const scripts = await Promise.all(names.filter(name => name.endsWith('.js')).map(name => readFile(path.join(temporary, 'dist/assets', name), 'utf8')));
    assert.ok(scripts.some(script => script.includes('https://tiles.streets.gl/vector/16/')));
    assert.ok(scripts.some(script => script.includes('https://nominatim.openstreetmap.org/search?')));
    assert.ok(scripts.every(script => !script.includes('api.atlas.test') && !script.includes('workers.dev')));
    assert.deepEqual(await readFile(path.join(temporary, 'dist/models.bin')), await readFile(path.join(temporary, 'public/models.bin')));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WUHAN, localizeStyle, resolveTileSource } from './map-config.mjs';
import { root, dataDirectory, download, exists, pmtilesBinary, execFile } from './map-tools.mjs';

async function main() {
  await mkdir(dataDirectory, { recursive: true });
  const lock = path.join(dataDirectory, '.download-lock');
  try { await mkdir(lock); } catch { throw new Error(`已有下载任务，若上次进程被强制结束，请删除 ${lock} 后重试。`); }
  try {
    const binary = await pmtilesBinary({ install: true });
    const manifestFile = path.join(dataDirectory, 'manifest.json');
    const previous = await exists(manifestFile) ? JSON.parse(await readFile(manifestFile, 'utf8')) : null;
    // 已有区域文件保持固定版本；更新时显式删除旧区域文件，避免混用 manifest。
    const tileFile = path.join(dataDirectory, 'wuhan.pmtiles');
    const planFile = path.join(dataDirectory, 'download-plan.json');
    const savedPlan = await exists(planFile) ? JSON.parse(await readFile(planFile, 'utf8')) : null;
    const hasTiles = await exists(tileFile);
    const index = hasTiles ? null : await execFile('curl', ['-fsSL', '--retry', '3', '--max-time', '60', 'https://btrfs.openfreemap.com/files.txt']);
    const source = resolveTileSource({ hasTiles, plannedSource: savedPlan?.source, previousSource: previous?.source, index: index?.stdout });
    await writeFile(planFile, JSON.stringify({ source, bounds: WUHAN.bounds }));
    console.log(`武汉范围：${WUHAN.bounds.join(',')}；数据源：${source}`);
    if (!await exists(tileFile)) {
      const temporary = tileFile + '.part';
      await rm(temporary, { force: true });
      await new Promise((resolve, reject) => {
        const child = spawn(binary, ['extract', source, temporary, `--bbox=${WUHAN.bounds.join(',')}`, `--maxzoom=${WUHAN.maxzoom}`, '--download-threads=4'], { stdio: 'inherit' });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`区域提取失败：${code}；重新执行可重试`)));
      });
      await rename(temporary, tileFile);
    }
    await execFile(binary, ['verify', tileFile]);
    const packages = [ ['fonts', 'ofm'], ['sprites', 'ofm_f384'], ['natural_earth', 'ofm'] ];
    for (const [kind, name] of packages) {
      const marker = path.join(dataDirectory, `.${kind}-complete`);
      if (await exists(marker)) continue;
      const archive = path.join(dataDirectory, '.downloads', `${kind}-${name}.tar.gz`);
      await download(`https://assets.openfreemap.com/${kind}/${name}.tar.gz`, archive);
      const destination = path.join(dataDirectory, kind);
      await mkdir(destination, { recursive: true });
      try { await execFile('tar', ['-xzf', archive, '-C', destination], { maxBuffer: 2 ** 20 }); }
      catch (error) { await rm(archive, { force: true }); throw error; }
      await writeFile(marker, name);
    }
    const online = JSON.parse(await readFile(path.join(root, 'public/style.json'), 'utf8'));
    const style = localizeStyle(online);
    for (const name of ['Noto Sans Regular', 'Noto Sans Italic', 'Noto Sans Bold']) {
      if (!await exists(path.join(dataDirectory, 'fonts/ofm', name, '0-255.pbf'))) throw new Error(`字体包不完整：${name}`);
    }
    for (const resource of ['natural_earth/ofm/ne2sr/0/0/0.png', 'sprites/ofm_f384/ofm.json', 'sprites/ofm_f384/ofm.png', 'sprites/ofm_f384/ofm@2x.json', 'sprites/ofm_f384/ofm@2x.png']) {
      if (!await exists(path.join(dataDirectory, resource))) throw new Error(`资源包不完整：${resource}`);
    }
    // 完整性标记最后生成；服务在此之前不会把半成品当成可用地图。
    await writeFile(path.join(dataDirectory, 'style.json'), JSON.stringify(style));
    const manifest = { version: 1, region: 'wuhan', bounds: WUHAN.bounds, center: WUHAN.center,
      maxzoom: WUHAN.maxzoom, source, downloadedAt: new Date().toISOString(),
      resources: packages.map(([kind, name]) => `https://assets.openfreemap.com/${kind}/${name}.tar.gz`) };
    await writeFile(manifestFile + '.tmp', JSON.stringify(manifest, null, 2));
    await rename(manifestFile + '.tmp', manifestFile);
    console.log(`下载完成：${dataDirectory}\n运行 pnpm maps:serve，再运行 pnpm dev，打开 http://localhost:5173/?basemap=local`);
  } finally { await rm(lock, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

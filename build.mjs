import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

// dist is generated exclusively from index.html, src/, public/ and npm dependencies.
await build({ root: fileURLToPath(new URL('./', import.meta.url)) });

const root = new URL('./dist/', import.meta.url);
const assets = {};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.bin': 'application/octet-stream', '.bis': 'application/octet-stream' };
async function collect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'server') continue;
    const name = prefix + '/' + entry.name;
    const file = new URL(entry.name, directory);
    if (entry.isDirectory()) await collect(new URL(entry.name + '/', directory), name);
    else assets[name] = [types[path.extname(entry.name)] || 'application/octet-stream', (await readFile(file)).toString('base64')];
  }
}
await collect(root);
const handler = await readFile(new URL('./handler.mjs', import.meta.url), 'utf8');
await mkdir(new URL('server/', root), { recursive: true });
await writeFile(new URL('server/index.js', root), `const assets = ${JSON.stringify(assets)};\n${handler}`);
console.log(`Packaged ${Object.keys(assets).length} built assets.`);

import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';

const root = new URL('./cloudflare/', import.meta.url);
await mkdir(new URL('assets/', root), { recursive: true });
await cp(new URL('./dist/', import.meta.url), new URL('assets/', root), {
  recursive: true,
  filter: source => !source.endsWith('/server')
});
let handler = await readFile(new URL('./handler.mjs', import.meta.url), 'utf8');
handler = handler.replace('async fetch(request)', 'async fetch(request, env)')
  .replace('const asset = assets[pathname];', `if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(new Request(new URL(pathname === '/index.html' ? '/' : pathname, url), request));\n    const asset = null;`);
await writeFile(new URL('worker.mjs', root), handler);
console.log('Cloudflare Worker and static assets prepared.');

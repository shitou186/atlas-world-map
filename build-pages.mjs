import { build } from 'vite';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// 只生成静态前端，不将 Node 服务或 Cloudflare 绑定文件上传到 Pages。
await build({ root: fileURLToPath(new URL('./', import.meta.url)), mode: 'pages' });
const output = new URL('./dist/', import.meta.url);
// 保留旧入口 /osm/；资源均已使用绝对部署前缀，复制入口无需改写资源引用。
await mkdir(new URL('osm/', output), { recursive: true });
await copyFile(new URL('index.html', output), new URL('osm/index.html', output));
await writeFile(new URL('.nojekyll', output), '');
console.log('GitHub Pages static frontend prepared.');

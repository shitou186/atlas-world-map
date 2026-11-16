import http from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { dataDirectory, exists, pmtilesBinary } from './map-tools.mjs';
import { forwardRequest } from './local-map-proxy.mjs';

export function createLocalMapServer({ directory = dataDirectory, tilePort = 8082 } = {}) {
  const types = { '.json': 'application/json; charset=utf-8', '.pbf': 'application/x-protobuf', '.png': 'image/png' };
  return http.createServer(async (request, response) => {
    const fail = (status, message) => response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(request.method === 'HEAD' ? undefined : message);
    try {
      if (!['GET', 'HEAD'].includes(request.method)) return fail(405, '仅支持 GET 和 HEAD');
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname.includes('\\') || pathname.split('/').includes('..') || pathname.includes('\0')) return fail(403, '路径不允许');
      if (!await exists(path.join(directory, 'manifest.json'))) return fail(503, '武汉地图包未就绪，请先运行 pnpm maps:download');
      if (pathname.startsWith('/tiles/')) {
        const match = /^\/tiles\/(\d+)\/(\d+)\/(\d+)\.mvt$/.exec(pathname);
        if (!match || Number(match[1]) > 14 || Number(match[2]) >= 2 ** Number(match[1]) || Number(match[3]) >= 2 ** Number(match[1])) return fail(400, '无效瓦片坐标');
        return forwardRequest(request, response, { port: tilePort, pathname: pathname.replace('/tiles/', '/wuhan/') });
      }
      // 只提供地图素材，不暴露下载缓存、工具、归档或其他本机文件。
      if (!/^\/(?:style\.json|manifest\.json|(?:fonts|sprites|natural_earth)\/.*)$/.test(pathname)) return fail(404, '地图资源不存在');
      const file = await realpath(path.join(directory, pathname));
      const realDirectory = await realpath(directory);
      if (!file.startsWith(realDirectory + path.sep)) return fail(403, '路径不允许');
      const info = await stat(file);
      if (!info.isFile()) return fail(404, '地图资源不存在');
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Content-Length': info.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch (error) {
      if (error instanceof URIError) fail(400, '无效路径编码');
      else fail(error.code === 'ENOENT' ? 404 : 500, '地图资源读取失败');
    }
  });
}

async function main() {
  if (!await exists(path.join(dataDirectory, 'manifest.json'))) throw new Error('武汉地图包未就绪，请先运行 pnpm maps:download');
  // 验证 manifest 可读，避免误启动残缺的数据包。
  JSON.parse(await readFile(path.join(dataDirectory, 'manifest.json'), 'utf8'));
  const binary = await pmtilesBinary();
  const port = Number(process.env.LOCAL_MAP_PORT || 8081);
  const tilePort = Number(process.env.LOCAL_MAP_TILE_PORT || 8082);
  if (![port, tilePort].every(value => Number.isInteger(value) && value > 0 && value < 65536) || port === tilePort) throw new Error('本地地图端口必须是两个不同的有效端口');
  const child = spawn(binary, ['serve', dataDirectory, '--interface=127.0.0.1', `--port=${tilePort}`, `--public-url=http://127.0.0.1:${tilePort}`], { stdio: 'inherit' });
  const server = createLocalMapServer({ tilePort });
  const stop = () => { server.close(); child.kill(); };
  child.once('error', error => { console.error(error.message); process.exitCode = 1; stop(); });
  child.once('exit', code => { server.close(); if (code) process.exitCode = code; });
  server.once('error', error => { console.error(error.message); process.exitCode = 1; child.kill(); });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  server.listen(port, '127.0.0.1', () => console.log(`武汉地图服务：http://127.0.0.1:${port}\n页面：http://localhost:5173/?basemap=local（三维与搜索继续联网）`));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });

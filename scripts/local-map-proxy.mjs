import http from 'node:http';

// 透传压缩字节和对应响应头，避免自动解压后 Content-Length/Encoding 不匹配。
export function forwardRequest(request, response, { port, pathname = request.url }) {
  const upstream = http.request({ hostname: '127.0.0.1', port, path: pathname, method: request.method }, incoming => {
    response.writeHead(incoming.statusCode, incoming.headers);
    incoming.pipe(response);
  });
  upstream.setTimeout(30000, () => upstream.destroy(new Error('本地地图服务超时')));
  upstream.on('error', () => {
    if (response.headersSent) return response.destroy();
    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : '武汉地图服务不可用，请先运行 pnpm maps:download 和 pnpm maps:serve');
  });
  response.on('close', () => upstream.destroy());
  upstream.end();
}

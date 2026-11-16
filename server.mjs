import http from 'node:http';
import app from './dist/server/index.js';

const port = Number(process.env.PORT || 4173);
const server = http.createServer(async (req, res) => {
  try {
    const response = await app.fetch(new Request(`http://localhost:${port}${req.url}`, { method: req.method }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  } catch (error) {
    console.error(error.message);
    res.writeHead(500).end('Server error');
  }
});
server.listen(port, '0.0.0.0', () => console.log(`Local: http://localhost:${port}`));

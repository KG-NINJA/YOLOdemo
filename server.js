// シンプルなローカルHTTPサーバ（外部通信なし）
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = process.env.PORT || 8080;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let p = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!p.startsWith(root)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(p, (err, stat) => {
    if (err) {
      res.writeHead(404); res.end('Not Found'); return;
    }
    if (stat.isDirectory()) p = path.join(p, 'index.html');
    fs.readFile(p, (err2, data) => {
      if (err2) { res.writeHead(404); res.end('Not Found'); return; }
      const ext = path.extname(p).toLowerCase();
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
});

server.listen(port, () => {
  console.log(`Local server running: http://localhost:${port}`);
});


const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const CHUNKS_DIR = path.join(__dirname, 'data/chunks');
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png',
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const m = url.pathname.match(/^\/api\/chunk\/(\d+)\/(\d+)$/);
  if (m) {
    const file = path.join(CHUNKS_DIR, `${m[1]}_${m[2]}.json`);
    if (fs.existsSync(file)) return serveFile(res, file);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('null');
    return;
  }

  if (url.pathname === '/api/meta') return serveFile(res, path.join(__dirname, 'data/meta.json'));
  if (url.pathname === '/api/palette') return serveFile(res, path.join(__dirname, 'data/palette.json'));
  if (url.pathname === '/api/log') return serveFile(res, path.join(__dirname, 'data/log.json'));

  if (url.pathname === '/api/chunk-index') {
    if (!fs.existsSync(CHUNKS_DIR)) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return; }
    const chunks = fs.readdirSync(CHUNKS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => { const p = f.replace('.json','').split('_'); return [+p[0], +p[1]]; });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(chunks));
    return;
  }

  if (url.pathname.startsWith('/data/')) return serveFile(res, path.join(__dirname, url.pathname));

  const filePath = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  serveFile(res, filePath);
}).listen(PORT, () => console.log(`MURAL running on port ${PORT}`))
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${PORT} already in use — server is already running.`);
      process.exit(0);
    }
    throw err;
  });

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
  fs.createReadStream(filePath).pipe(res);
}

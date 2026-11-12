/* ═══════════════════════════════════════
   TRANSMISSION PORTAL — public entrypoint
   Plain Node http server, no dependencies.
   Serves the static site and reverse-proxies /api/*
   to the local data API (server.js), all on one port
   so nginx/root isn't required to expose the portal.
   ═══════════════════════════════════════ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUBLIC_PORT = process.env.PUBLIC_PORT || 5454;
const API_PORT = process.env.API_PORT || 5455;
const ROOT = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/* always revalidated (see serveStatic) */
const REVALIDATE = new Set(['.html', '.js', '.css', '.json', '']);

function proxyToApi(req, res) {
  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: API_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API indisponível' }));
  });
  req.pipe(proxyReq);
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let filePath = path.normalize(path.join(ROOT, urlPath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      /* cache: the browser keeps the files but asks every time whether they
         changed (ETag → 304 Not Modified, no body). Code and pages are always
         revalidated, so a deploy shows up on a normal reload — no Ctrl+Shift+R;
         images/fonts can be reused for an hour without asking. */
      const etag = '"' + crypto.createHash('sha1').update(data).digest('base64url').slice(0, 20) + '"';
      const headers = {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': REVALIDATE.has(ext) ? 'no-cache' : 'public, max-age=3600',
        ETag: etag,
      };
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers);
        res.end();
        return;
      }
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    proxyToApi(req, res);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }
  serveStatic(req, res);
});

server.listen(PUBLIC_PORT, '0.0.0.0', () => {
  console.log('transmission-portal listening on 0.0.0.0:' + PUBLIC_PORT);
});

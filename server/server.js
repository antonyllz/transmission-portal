/* ═══════════════════════════════════════
   TRANSMISSION PORTAL — shared data API
   Plain Node http server, no dependencies.
   Persists cases/demands/rmas/lambdas as JSON files so every
   user hitting the portal reads/writes the same data.
   ═══════════════════════════════════════ */
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT     = process.env.PORT || 5455;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MAX_BODY = 5 * 1024 * 1024;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  cases:   path.join(DATA_DIR, 'cases.json'),
  demands: path.join(DATA_DIR, 'demands.json'),
  rmas:    path.join(DATA_DIR, 'rmas.json'),
  lambdas: path.join(DATA_DIR, 'lambdas.json'),
  netpos:  path.join(DATA_DIR, 'netpos.json'),
  itens:     path.join(DATA_DIR, 'itens.json'),      /* almoxarifado catalog */
  itensmeta: path.join(DATA_DIR, 'itensmeta.json')
};

function readCollection(name) {
  try { return JSON.parse(fs.readFileSync(FILES[name], 'utf8')); }
  catch (e) { return []; }
}

function writeCollection(name, data) {
  const tmp = FILES[name] + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILES[name]);
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json)
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer((req, res) => {
  const url   = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean); // ['api','cases']

  if (parts[0] !== 'api' || !Object.prototype.hasOwnProperty.call(FILES, parts[1]) || parts.length !== 2) {
    send(res, 404, { error: 'Not found' });
    return;
  }
  const collection = parts[1];

  if (req.method === 'GET') {
    send(res, 200, readCollection(collection));
    return;
  }

  if (req.method === 'PUT') {
    readBody(req).then((body) => {
      if (!Array.isArray(body)) { send(res, 400, { error: 'Expected a JSON array' }); return; }
      writeCollection(collection, body);
      send(res, 200, { ok: true });
    }).catch((e) => send(res, 400, { error: e.message }));
    return;
  }

  send(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('transmission-portal API listening on 127.0.0.1:' + PORT);
});

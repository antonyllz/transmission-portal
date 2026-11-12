/* ═══════════════════════════════════════
   Minimal SNMP v2c GET client (no dependencies): BER encode the request,
   send it over UDP, decode the varbinds of the response.
   Values: INTEGER/Gauge/Counter32/TimeTicks → Number, Counter64 → BigInt,
   OCTET STRING → String, noSuchObject/noSuchInstance → null.
   ═══════════════════════════════════════ */
'use strict';
const dgram = require('dgram');

/* ── BER encode ── */
function len(n) {
  if (n < 0x80) return Buffer.from([n]);
  const b = [];
  while (n > 0) { b.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | b.length, ...b]);
}
const tlv = (type, body) => Buffer.concat([Buffer.from([type]), len(body.length), body]);
function int(n) {
  const b = [];
  do { b.unshift(n & 0xff); n >>= 8; } while (n !== 0 && n !== -1);
  if (n === 0 && b[0] & 0x80) b.unshift(0);
  return tlv(0x02, Buffer.from(b));
}
function oid(str) {
  const p = String(str).replace(/^\./, '').split('.').map(Number);
  const out = [40 * p[0] + p[1]];
  for (const v of p.slice(2)) {
    const s = [v & 0x7f];
    let x = Math.floor(v / 128);
    while (x > 0) { s.unshift((x & 0x7f) | 0x80); x = Math.floor(x / 128); }
    out.push(...s);
  }
  return tlv(0x06, Buffer.from(out));
}
const seq = (...items) => tlv(0x30, Buffer.concat(items));

function getRequest(community, reqId, oids) {
  const vbs = seq(...oids.map((o) => seq(oid(o), Buffer.from([0x05, 0x00]))));
  const pdu = tlv(0xa0, Buffer.concat([int(reqId), int(0), int(0), vbs]));
  return seq(int(1), tlv(0x04, Buffer.from(String(community))), pdu);   /* version 1 = v2c */
}

/* ── BER decode ── */
function read(buf, pos) {
  const type = buf[pos];
  let l = buf[pos + 1], p = pos + 2;
  if (l & 0x80) { const n = l & 0x7f; l = 0; for (let i = 0; i < n; i++) l = l * 256 + buf[p + i]; p += n; }
  return { type, start: p, end: p + l };
}
function children(buf, t) {
  const out = [];
  for (let p = t.start; p < t.end;) { const c = read(buf, p); out.push(c); p = c.end; }
  return out;
}
function decOid(b) {
  const out = [Math.floor(b[0] / 40), b[0] % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) { v = v * 128 + (b[i] & 0x7f); if (!(b[i] & 0x80)) { out.push(v); v = 0; } }
  return out.join('.');
}
function value(buf, t) {
  const b = buf.subarray(t.start, t.end);
  switch (t.type) {
    case 0x02: { let n = 0; for (const x of b) n = n * 256 + x; return b.length && b[0] & 0x80 ? n - Math.pow(256, b.length) : n; }   /* signed */
    case 0x41: case 0x42: case 0x43: { let n = 0; for (const x of b) n = n * 256 + x; return n; }
    case 0x46: { let n = 0n; for (const x of b) n = n * 256n + BigInt(x); return n; }
    case 0x04: return b.toString('utf8');
    case 0x06: return decOid(b);
    case 0x40: return Array.from(b).join('.');
    default: return null;                                  /* NULL, noSuchObject, noSuchInstance, endOfMibView */
  }
}
function parseResponse(buf) {
  const msg = read(buf, 0);
  const [, , pdu] = children(buf, msg);
  const [rid, err, , vbl] = children(buf, pdu);
  const out = { reqId: value(buf, rid), error: value(buf, err), values: {} };
  for (const vb of children(buf, vbl)) {
    const [o, v] = children(buf, vb);
    out.values[decOid(buf.subarray(o.start, o.end))] = value(buf, v);
  }
  return out;
}

/* one request/response over UDP, with retries */
function request(host, opts, build) {
  const { port = 161, timeout = 3000, retries = 1 } = opts || {};
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    const reqId = Math.floor(Math.random() * 0x7fffffff);
    const pkt = build(reqId);
    let tries = 0, timer;
    const done = (err, v) => { clearTimeout(timer); try { sock.close(); } catch (e) { /* closed */ } err ? reject(err) : resolve(v); };
    const send = () => {
      tries++;
      sock.send(pkt, port, host, (e) => { if (e) done(e); });
      timer = setTimeout(() => (tries > retries ? done(new Error('SNMP timeout (' + host + ')')) : send()), timeout);
    };
    sock.on('message', (m) => {
      try {
        const r = parseResponse(m);
        if (r.reqId !== reqId) return;
        if (r.error) return done(new Error('SNMP error-status ' + r.error));
        done(null, r.values);
      } catch (e) { done(e); }
    });
    sock.on('error', (e) => done(e));
    send();
  });
}

/* get(host, community, [oids]) → { oid: value } */
function get(host, community, oids, opts) {
  return request(host, opts, (id) => getRequest(community, id, oids));
}

/* GETBULK (v2c): non-repeaters 0, max-repetitions n */
function bulkRequest(community, reqId, oidStr, n) {
  const vbs = seq(seq(oid(oidStr), Buffer.from([0x05, 0x00])));
  const pdu = tlv(0xa5, Buffer.concat([int(reqId), int(0), int(n), vbs]));
  return seq(int(1), tlv(0x04, Buffer.from(String(community))), pdu);
}

/* walk(host, community, base) → { oid: value } for every oid under base (GETBULK pages) */
async function walk(host, community, base, opts) {
  const out = {};
  const prefix = String(base).replace(/^\./, '') + '.';
  let cur = prefix.slice(0, -1);
  for (let page = 0; page < 200; page++) {
    const vals = await request(host, opts, (id) => bulkRequest(community, id, cur, 40));
    const keys = Object.keys(vals);
    let more = false;
    for (const k of keys) {
      if (!k.startsWith(prefix)) { more = false; break; }
      out[k] = vals[k];
      cur = k; more = true;
    }
    if (!more || !keys.length) break;
  }
  return out;
}

/* encoders exported for tests (a fake agent) */
const c64 = (n) => { const b = []; let x = BigInt(n); do { b.unshift(Number(x & 0xffn)); x >>= 8n; } while (x > 0n); if (b[0] & 0x80) b.unshift(0); return tlv(0x46, Buffer.from(b)); };
const uint = (n) => { const b = []; do { b.unshift(n & 0xff); n = Math.floor(n / 256); } while (n > 0); if (b[0] & 0x80) b.unshift(0); return Buffer.from(b); };
const pduType = (buf) => { const msg = read(buf, 0); return children(buf, msg)[2].type; };
module.exports = { get, walk, getRequest, parseResponse, _uint: uint, _pduType: pduType, _tlv: tlv, _int: int, _oid: oid, _seq: seq, _c64: c64 };

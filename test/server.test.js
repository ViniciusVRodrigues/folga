import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from '../src/server.js';
import { request } from './helpers.js';

let srv;
before(async () => { srv = await startServer({ port: 0 }); });
after(async () => { await srv.close(); });

const tok = () => ({ 'X-Token': srv.token });

test('token tem 32 bytes em hex', () => {
  assert.match(srv.token, /^[0-9a-f]{64}$/);
});

test('403 sem token na API', async () => {
  const r = await request(srv.port, { path: '/api/drives' });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'FORBIDDEN');
});

test('403 com token errado', async () => {
  const r = await request(srv.port, { path: '/api/drives', headers: { 'X-Token': 'x'.repeat(64) } });
  assert.equal(r.status, 403);
});

test('200 com token', async () => {
  const r = await request(srv.port, { path: '/api/drives', headers: tok() });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.drives));
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('403 com Host errado, inclusive em estático', async () => {
  for (const p of ['/api/drives', '/']) {
    const r = await request(srv.port, { path: p, headers: { ...tok(), Host: 'evil.example:' + srv.port } });
    assert.equal(r.status, 403, p);
  }
  const r = await request(srv.port, { path: '/', headers: { Host: '127.0.0.1:1' } });
  assert.equal(r.status, 403);
});

test('aceita Host localhost:<porta>', async () => {
  const r = await request(srv.port, { path: '/api/drives', headers: { ...tok(), Host: 'localhost:' + srv.port } });
  assert.equal(r.status, 200);
});

test('403 com Origin de fora; ok com a própria origem', async () => {
  const bad = await request(srv.port, { method: 'POST', path: '/api/scan/cancel', headers: { ...tok(), Origin: 'https://evil.example' } });
  assert.equal(bad.status, 403);
  const ok = await request(srv.port, { path: '/api/drives', headers: { ...tok(), Origin: `http://127.0.0.1:${srv.port}` } });
  assert.equal(ok.status, 200);
});

test('estático: index.html em / com CSP e nosniff', async () => {
  const r = await request(srv.port, { path: '/' });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/html/);
  assert.match(r.text, /folga/);
  assert.match(r.headers['content-security-policy'], /default-src 'self'/);
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['referrer-policy'], 'no-referrer');
});

test('estático: 404 para o que não existe', async () => {
  const r = await request(srv.port, { path: '/nao-existe.js' });
  assert.equal(r.status, 404);
});

test('path traversal bloqueado', async () => {
  for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/%2e%2e%5cpackage.json', '/..\\package.json', '/a%00b']) {
    const r = await request(srv.port, { path: p });
    assert.ok([400, 403, 404].includes(r.status), `${p} -> ${r.status}`);
    assert.ok(!r.text.includes('"name": "folga"'), p);
  }
});

test('API desconhecida: 404 no formato do contrato', async () => {
  const r = await request(srv.port, { path: '/api/nada', headers: tok() });
  assert.equal(r.status, 404);
  assert.equal(r.json.error.code, 'NOT_FOUND');
});

test('SSE: /api/events exige ?t= e envia eventos', async () => {
  const no = await request(srv.port, { path: '/api/events' });
  assert.equal(no.status, 403);
  const got = await new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: srv.port, path: '/api/events?t=' + srv.token }, (res) => {
      assert.match(res.headers['content-type'], /text\/event-stream/);
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (d) => {
        buf += d;
        if (buf.includes('event: ping')) { req.destroy(); resolve(buf); }
      });
      setTimeout(() => srv.events.broadcast('ping', { a: 1 }), 50);
    });
    req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
  });
  assert.match(got, /data: \{"a":1\}/);
});

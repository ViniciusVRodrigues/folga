import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.js';
import { request, waitFor } from './helpers.js';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-routes-'));
let srv;
const api = (p, o = {}) => request(srv.port, { ...o, path: p, headers: { 'X-Token': srv.token, 'Content-Type': 'application/json', ...(o.headers || {}) } });
const done = [];

before(async () => {
  fs.mkdirSync(path.join(base, 'a'), { recursive: true });
  fs.mkdirSync(path.join(base, 'b', 'c'), { recursive: true });
  fs.writeFileSync(path.join(base, 'a', 'f'), Buffer.alloc(4000, 1));
  fs.writeFileSync(path.join(base, 'b', 'c', 'g'), Buffer.alloc(9000, 1));
  fs.writeFileSync(path.join(base, 'b', 'big.iso'), Buffer.alloc(20000, 1));
  srv = await startServer({ port: 0, largeFileMin: 10000 });
  const orig = srv.events.broadcast.bind(srv.events);
  srv.events.broadcast = (e, d) => { if (e === 'scan-done') done.push(d); orig(e, d); };
});
after(async () => {
  await srv.close();
  fs.rmSync(base, { recursive: true, force: true });
});

test('400 com caminho inválido', async () => {
  for (const body of [{}, { path: 'relativo' }, { path: path.join(base, 'nao-existe') }, { path: path.join(base, 'a', 'f') }]) {
    const r = await api('/api/scan', { method: 'POST', body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.json.error.code, 'BAD_REQUEST');
  }
});

test('409 NO_SCAN antes de varrer', async () => {
  const r = await api('/api/tree?path=' + encodeURIComponent(base));
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'NO_SCAN');
});

test('scan, scan-done, tree, large-files, 404 fora da raiz', async () => {
  const r = await api('/api/scan', { method: 'POST', body: { path: base } });
  assert.equal(r.status, 202);
  assert.match(r.json.scanId, /^s\d+$/);
  await waitFor(() => done.length >= 1);
  assert.equal(done[0].partial, false);
  assert.equal(done[0].files, 3);

  const t = await api('/api/tree?path=' + encodeURIComponent(base));
  assert.equal(t.status, 200);
  assert.equal(t.json.size, 33000);
  assert.equal(t.json.parent, null);
  assert.deepEqual(t.json.children.map((c) => c.name), ['b', 'a']);
  assert.equal(t.json.children[0].type, 'dir');

  const sub = await api('/api/tree?path=' + encodeURIComponent(path.join(base, 'b')) + '&limit=1');
  assert.equal(sub.json.parent.toLowerCase(), base.toLowerCase());
  assert.equal(sub.json.children.length, 1);
  assert.equal(sub.json.children[0].name, 'big.iso');
  assert.equal(sub.json.more.count, 1);
  assert.equal(sub.json.more.size, 9000);

  // sem diferenciar maiúsculas no Windows
  const up = await api('/api/tree?path=' + encodeURIComponent(base.toUpperCase()));
  assert.equal(up.status, process.platform === 'win32' ? 200 : 404);

  const out = await api('/api/tree?path=' + encodeURIComponent(os.homedir()));
  assert.equal(out.status, 404);

  const lf = await api('/api/large-files?min=10000');
  assert.equal(lf.status, 200);
  assert.deepEqual(lf.json.files.map((f) => [path.basename(f.path), f.size, f.ext]), [['big.iso', 20000, '.iso']]);
});

test('409 numa segunda varredura simultânea; cancelar devolve scan-done', async () => {
  const n = done.length;
  const a = await api('/api/scan', { method: 'POST', body: { path: os.tmpdir() } });
  assert.equal(a.status, 202);
  const b = await api('/api/scan', { method: 'POST', body: { path: base } });
  assert.equal(b.status, 409);
  assert.equal(b.json.error.code, 'SCAN_RUNNING');
  const c = await api('/api/scan/cancel', { method: 'POST', body: {} });
  assert.deepEqual(c.json, { ok: true });
  await waitFor(() => done.length > n);
});

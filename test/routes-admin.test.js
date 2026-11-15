import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.js';
import { scanTree as realScan } from '../src/scan/walk.js';
import { request, waitFor } from './helpers.js';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-radm-'));
let srv;
const calls = [];
let mode = 'js';
// leitor falso: o normal varre em JS; o admin recusa (UAC) ou falha conforme o modo
async function fakeScan(root, opts) {
  calls.push({ root, admin: opts.admin });
  if (!opts.admin) return realScan(root, { ...opts, backend: 'js' });
  if (mode === 'decline') return { declined: true, admin: true, backend: 'fast', partial: true, elapsedMs: 1 };
  if (mode === 'fail') throw new Error('falhou');
  const r = await realScan(root, { ...opts, admin: false, backend: 'js' });
  return { ...r, admin: true, backend: 'fast' };
}
const api = (p, o = {}) => request(srv.port, { ...o, path: p, headers: { 'X-Token': srv.token, 'Content-Type': 'application/json' } });
const done = [];
const nextDone = async (n) => { await waitFor(() => done.length >= n); return done[n - 1]; };

before(async () => {
  fs.mkdirSync(path.join(base, 'a'));
  fs.writeFileSync(path.join(base, 'a', 'f'), Buffer.alloc(4000, 1));
  srv = await startServer({ port: 0, largeFileMin: 10000, scanTree: fakeScan });
  const orig = srv.events.broadcast.bind(srv.events);
  srv.events.broadcast = (e, d) => { if (e === 'scan-done') done.push(d); orig(e, d); };
});
after(async () => {
  await srv.close();
  fs.rmSync(base, { recursive: true, force: true });
});

test('admin precisa ser booleano', async () => {
  const r = await api('/api/scan', { method: 'POST', body: { path: base, admin: 'sim' } });
  assert.equal(r.status, 400);
});

test('status diz se dá para elevar', async () => {
  const s = await api('/api/scan/status');
  assert.equal(s.json.canElevate, process.platform === 'win32');
  assert.equal(s.json.admin, false);
});

test('UAC recusado mantém a varredura anterior', { skip: process.platform !== 'win32' }, async () => {
  await api('/api/scan', { method: 'POST', body: { path: base } });
  const first = await nextDone(1);
  assert.equal(first.files, 1);
  assert.equal(first.admin, false);

  mode = 'decline';
  const r = await api('/api/scan', { method: 'POST', body: { path: base, admin: true } });
  assert.equal(r.status, 202);
  const d = await nextDone(2);
  assert.equal(d.declined, true);
  assert.equal(d.files, 1, 'resumo da varredura anterior');
  assert.equal(calls.at(-1).admin, true);
  const t = await api('/api/tree?path=' + encodeURIComponent(base));
  assert.equal(t.status, 200, 'a árvore anterior continua navegável');
  const s = await api('/api/scan/status');
  assert.equal(s.json.state, 'done');
  assert.equal(s.json.admin, false);

  mode = 'fail';
  await api('/api/scan', { method: 'POST', body: { path: base, admin: true } });
  const f = await nextDone(3);
  assert.equal(f.failed, true);
  assert.equal(f.files, 1);
  assert.equal((await api('/api/tree?path=' + encodeURIComponent(base))).status, 200);

  mode = 'ok';
  await api('/api/scan', { method: 'POST', body: { path: base, admin: true } });
  const ok = await nextDone(4);
  assert.equal(ok.admin, true);
  assert.equal(ok.declined, undefined);
  assert.equal((await api('/api/scan/status')).json.admin, true);
});

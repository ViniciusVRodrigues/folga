import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.js';
import { request, waitFor } from './helpers.js';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-clr-'));
const home = path.join(base, 'home');
const env = {
  USERPROFILE: home, LOCALAPPDATA: path.join(home, 'AppData', 'Local'), APPDATA: path.join(home, 'AppData', 'Roaming'),
  TEMP: path.join(home, 'AppData', 'Local', 'Temp'), WINDIR: path.join(base, 'Windows'), ProgramData: path.join(base, 'PD'),
  'ProgramFiles(x86)': path.join(base, 'PF86'), ProgramFiles: path.join(base, 'PF'), SystemDrive: 'C:',
};
let srv;
const events = [];
const api = (p, o = {}) => request(srv.port, { ...o, path: p, headers: { 'X-Token': srv.token, 'Content-Type': 'application/json' } });

before(async () => {
  fs.mkdirSync(env.TEMP, { recursive: true });
  fs.writeFileSync(path.join(env.TEMP, 'a.tmp'), Buffer.alloc(9000, 1));
  fs.mkdirSync(path.join(env.WINDIR, 'Temp'), { recursive: true });
  fs.writeFileSync(path.join(env.WINDIR, 'Temp', 'b.tmp'), Buffer.alloc(9000, 1));
  srv = await startServer({ port: 0, catalog: { env, devRoots: [], modelDirs: [] } });
  const orig = srv.events.broadcast.bind(srv.events);
  srv.events.broadcast = (e, d) => { events.push([e, d]); orig(e, d); };
});
after(async () => { await srv.close(); fs.rmSync(base, { recursive: true, force: true }); });

test('GET /api/cleanup antes do refresh devolve 409 NO_SCAN', async () => {
  const r = await api('/api/cleanup');
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'NO_SCAN');
});

test('refresh responde 202, emite progresso e done; GET devolve o contrato', async () => {
  const r = await api('/api/cleanup/refresh', { method: 'POST' });
  assert.equal(r.status, 202);
  await waitFor(() => events.some(([e]) => e === 'cleanup-done'));
  assert.ok(events.some(([e, d]) => e === 'cleanup-progress' && typeof d.category === 'string' && d.total > 0 && d.done > 0));
  const g = await api('/api/cleanup');
  assert.equal(g.status, 200);
  const j = g.json;
  assert.ok(j.generatedAt);
  assert.ok(j.summary.safeNow >= 9000 && j.summary.needsDecision >= 9000);
  assert.deepEqual(j.categories.map((c) => c.id), ['system']);
  const t = j.categories[0].items.find((i) => i.id === 'system.user-temp');
  assert.equal(t.risk, 'low');
  assert.equal(t.preselect, true);
  assert.deepEqual(t.paths, [env.TEMP]);
  assert.ok(j.checked.includes('Steam'));
  assert.equal(j.categories[0].counts.admin, 1);
  assert.equal(srv.state.cleanup.items.get('system.user-temp').method, 'trash-contents');
});

test('rota exige token', async () => {
  const r = await request(srv.port, { path: '/api/cleanup' });
  assert.equal(r.status, 403);
});

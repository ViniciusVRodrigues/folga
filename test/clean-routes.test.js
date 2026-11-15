import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { startServer } from '../src/server.js';
import { request, waitFor } from './helpers.js';
import { hashOfEncoded, encodeScript } from '../src/clean/admin.js';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-cln-'));
const home = path.join(base, 'home');
const env = {
  USERPROFILE: home, LOCALAPPDATA: path.join(home, 'AppData', 'Local'), APPDATA: path.join(home, 'AppData', 'Roaming'),
  TEMP: path.join(home, 'AppData', 'Local', 'Temp'), WINDIR: path.join(base, 'Windows'), ProgramData: path.join(base, 'PD'),
  'ProgramFiles(x86)': path.join(base, 'PF86'), ProgramFiles: path.join(base, 'PF'), SystemDrive: 'C:',
};
const downloads = path.join(home, 'Downloads');
const crash = path.join(env.LOCALAPPDATA, 'CrashDumps');
const wTemp = path.join(env.WINDIR, 'Temp');
const wPrefetch = path.join(env.WINDIR, 'Prefetch');

const fixed = {
  mountvolOff: false,
};
let calls = [];
const fakeExec = async (file, args) => {
  calls.push([file, args]);
  if (file === 'powershell.exe' && fixed.declineUac) { const e = new Error('The operation was canceled by the user'); e.code = 1223; throw e; }
  if (file === 'explorer.exe') { const e = new Error('x'); e.code = 1; throw e; }
  return { stdout: '', stderr: '' };
};
let trashMode = 'ok';
const trashed = [];
const fakeTrash = async (list) => {
  if (trashMode === 'fail') throw new Error('Cannot move: path too long');
  for (const p of list) { trashed.push(p); fs.rmSync(p, { recursive: true, force: true }); }
};
let bin = { nuke: false, maxBytes: null };

let srv;
const api = (p, o = {}) => request(srv.port, { ...o, path: p, headers: { 'X-Token': srv.token, 'Content-Type': 'application/json' } });
const post = (p, body) => api(p, { method: 'POST', body });
const entry = (o) => ({ roots: o.paths, action: 'clean', needsAdmin: false, regenerable: true, size: 4096, ...o });
const job = async (jobId) => waitFor(async () => { const r = await api('/api/clean/' + jobId); return r.json.status === 'done' ? r.json : null; });

function fillFixture() {
  fs.rmSync(base, { recursive: true, force: true });
  for (const d of [env.TEMP, crash, downloads, wTemp, wPrefetch]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(env.TEMP, 'a.tmp'), Buffer.alloc(5000, 1));
  fs.writeFileSync(path.join(downloads, 'doc.pdf'), 'x');
  fs.writeFileSync(path.join(wTemp, 'w.tmp'), 'x');
  srv.state.cleanup.items = new Map([
    ['t.temp', entry({ paths: [env.TEMP], method: 'trash-contents' })],
    ['t.crash', entry({ paths: [crash], method: 'trash-contents' })],
    ['t.dl', entry({ paths: [path.join(downloads, 'doc.pdf')], roots: [downloads], method: 'trash', regenerable: false })],
    ['t.guided', entry({ paths: [downloads], method: null, action: 'guided', regenerable: false })],
    ['t.wtemp', entry({ paths: [wTemp], method: 'admin-contents', action: 'admin', needsAdmin: true })],
    ['t.prefetch', entry({ paths: [wPrefetch], method: 'admin-contents', action: 'admin', needsAdmin: true })],
    ['t.evil', entry({ paths: [env.WINDIR], method: 'admin-contents', action: 'admin', needsAdmin: true })],
    ['t.home', entry({ paths: [home], method: 'trash-contents' })],
  ]);
}

before(async () => {
  srv = await startServer({ port: 0, catalog: { env, devRoots: [], modelDirs: [] }, clean: { exec: fakeExec, trash: fakeTrash, binInfo: async () => bin } });
  fillFixture();
});
after(async () => { await srv.close(); fs.rmSync(base, { recursive: true, force: true }); });

test('delete em item não regenerável: 400; guiado: 400; desconhecido: 409 STALE_ITEM', async () => {
  let r = await post('/api/clean', { items: [{ id: 't.dl', mode: 'delete' }] });
  assert.equal(r.status, 400);
  r = await post('/api/clean', { items: [{ id: 't.guided' }] });
  assert.equal(r.status, 400);
  r = await post('/api/clean', { items: [{ id: 't.temp' }, { id: 'nao.existe' }] });
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'STALE_ITEM');
  assert.deepEqual(r.json.error.items, ['nao.existe']);
  assert.ok(fs.existsSync(path.join(env.TEMP, 'a.tmp')), 'nada foi limpo');
  assert.ok(fs.existsSync(path.join(downloads, 'doc.pdf')));
  r = await post('/api/clean', { items: [{ id: 't.temp', mode: 'nuke' }] });
  assert.equal(r.status, 400);
});

test('trash: vai para a Lixeira (fake), emite eventos e resumo', async () => {
  const events = [];
  const orig = srv.events.broadcast.bind(srv.events);
  srv.events.broadcast = (e, d) => { events.push([e, d]); orig(e, d); };
  const r = await post('/api/clean', { items: [{ id: 't.temp' }] });
  assert.equal(r.status, 202);
  assert.deepEqual(r.json.plan.map((p) => [p.itemId, p.permanent, p.needsAdmin]), [['t.temp', false, false]]);
  const j = await job(r.json.jobId);
  assert.equal(j.items[0].status, 'done');
  assert.ok(j.freed > 0 && j.movedToBin === j.freed && j.deletedPermanently === 0);
  assert.ok(j.drive && j.drive.root);
  assert.ok(!fs.existsSync(path.join(env.TEMP, 'a.tmp')));
  assert.ok(events.some(([e, d]) => e === 'clean-progress' && d.status === 'running'));
  assert.ok(events.some(([e, d]) => e === 'clean-done' && d.jobId === r.json.jobId));
  srv.events.broadcast = orig;
});

test('falha do trash vira failed e NUNCA vira exclusão definitiva', async () => {
  fillFixture();
  trashMode = 'fail';
  const r = await post('/api/clean', { items: [{ id: 't.temp' }] });
  const j = await job(r.json.jobId);
  trashMode = 'ok';
  assert.equal(j.items[0].status, 'failed');
  assert.equal(j.items[0].reason, 'too-deep');
  assert.equal(j.freed, 0);
  assert.ok(fs.existsSync(path.join(env.TEMP, 'a.tmp')));
});

test('would-be-permanent: sem confirmação não limpa; com confirmPermanent limpa e conta como definitivo', async () => {
  fillFixture();
  bin = { nuke: true, maxBytes: null };
  let r = await post('/api/clean', { items: [{ id: 't.temp' }] });
  assert.equal(r.json.plan[0].permanent, true);
  let j = await job(r.json.jobId);
  assert.equal(j.items[0].status, 'failed');
  assert.equal(j.items[0].reason, 'would-be-permanent');
  assert.ok(fs.existsSync(path.join(env.TEMP, 'a.tmp')));
  r = await post('/api/clean', { items: [{ id: 't.temp', confirmPermanent: true }] });
  j = await job(r.json.jobId);
  bin = { nuke: false, maxBytes: null };
  assert.equal(j.items[0].status, 'done');
  assert.ok(j.deletedPermanently > 0 && j.movedToBin === 0);
});

test('raiz do perfil como item é recusada pela guarda (protected)', async () => {
  fillFixture();
  const r = await post('/api/clean', { items: [{ id: 't.home' }] });
  const j = await job(r.json.jobId);
  assert.equal(j.items[0].status, 'failed');
  assert.equal(j.items[0].reason, 'protected');
});

test('delete: junction dentro do item não é seguida', async () => {
  fillFixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-cout-'));
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  fs.mkdirSync(path.join(crash, 'proj'));
  fs.symlinkSync(outside, path.join(crash, 'proj', 'jn'), 'junction');
  const r = await post('/api/clean', { items: [{ id: 't.crash', mode: 'delete' }] });
  const j = await job(r.json.jobId);
  assert.equal(j.items[0].status, 'done');
  assert.ok(!fs.existsSync(path.join(crash, 'proj')));
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
  fs.rmSync(outside, { recursive: true, force: true });
});

test('falha parcial: item em uso (handle exclusivo) falha, o outro limpa; freed soma só o segundo', async () => {
  fillFixture();
  const locked = path.join(crash, 'locked.dmp');
  fs.writeFileSync(locked, Buffer.alloc(8000, 1));
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$f=[IO.File]::Open('${locked.replace(/'/g, "''")}','Open','ReadWrite','None'); Write-Host READY; Start-Sleep 120`], { stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    await new Promise((res, rej) => { ps.stdout.on('data', (d) => { if (String(d).includes('READY')) res(); }); ps.on('exit', () => rej(new Error('ps saiu'))); setTimeout(() => rej(new Error('timeout')), 20000); });
    const r = await post('/api/clean', { items: [{ id: 't.crash', mode: 'delete' }, { id: 't.temp', mode: 'delete' }] });
    const j = await job(r.json.jobId);
    const a = j.items.find((i) => i.itemId === 't.crash');
    const b = j.items.find((i) => i.itemId === 't.temp');
    assert.equal(a.status, 'failed');
    assert.equal(a.reason, 'in-use');
    assert.equal(a.freed, 0);
    assert.equal(b.status, 'done');
    assert.equal(j.freed, b.freed);
    assert.ok(b.freed > 0);
    assert.ok(fs.existsSync(locked));
  } finally {
    ps.kill();
    await new Promise((res) => { ps.on('exit', res); setTimeout(res, 3000); });
  }
});

test('admin: sha256 do script exibido == script executado (UAC injetado)', async () => {
  fillFixture();
  const shown = await api('/api/admin-script?items=t.prefetch,t.wtemp');
  assert.equal(shown.status, 200);
  assert.match(shown.json.script, /Remove-Item/);
  assert.match(shown.json.script, /-ErrorAction Continue/);
  assert.equal(shown.json.sha256, crypto.createHash('sha256').update(shown.json.script, 'utf8').digest('hex'));
  calls = [];
  const r = await post('/api/clean', { items: [{ id: 't.wtemp' }, { id: 't.prefetch' }] });
  assert.equal(r.status, 202);
  assert.ok(r.json.plan.every((p) => p.needsAdmin && p.permanent));
  const j = await job(r.json.jobId);
  const ps = calls.filter(([f]) => f === 'powershell.exe');
  assert.equal(ps.length, 1, 'uma só elevação');
  const outer = Buffer.from(ps[0][1][ps[0][1].indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le');
  assert.match(outer, /Start-Process .*-Verb RunAs -Wait/);
  const inner = /'-EncodedCommand','([A-Za-z0-9+/=]+)'/.exec(outer)[1];
  assert.equal(hashOfEncoded(inner), shown.json.sha256);
  assert.equal(inner, encodeScript(shown.json.script));
  assert.ok(j.items.every((i) => i.status === 'done'));
});

test('admin: recusa do UAC (1223) vira admin-declined', async () => {
  fillFixture();
  fixed.declineUac = true;
  const r = await post('/api/clean', { items: [{ id: 't.wtemp' }] });
  const j = await job(r.json.jobId);
  fixed.declineUac = false;
  assert.equal(j.items[0].status, 'failed');
  assert.equal(j.items[0].reason, 'admin-declined');
  assert.ok(fs.existsSync(path.join(wTemp, 'w.tmp')));
});

test('admin-script recusa item fora das pastas de admin e item que não é admin', async () => {
  assert.equal((await api('/api/admin-script?items=t.evil')).status, 400);
  assert.equal((await api('/api/admin-script?items=t.temp')).status, 400);
  assert.equal((await api('/api/admin-script?items=x')).status, 409);
});

test('open: só abre o que o mapa tem, via execFile', async () => {
  calls = [];
  let r = await post('/api/open', { itemId: 't.temp', kind: 'explorer' });
  assert.equal(r.status, 200);
  assert.deepEqual(calls[0], ['explorer.exe', [env.TEMP]]);
  r = await post('/api/open', { itemId: 'zzz', kind: 'explorer' });
  assert.equal(r.status, 409);
  r = await post('/api/open', { itemId: 't.temp', kind: 'steam-uninstall' });
  assert.equal(r.status, 400);
  r = await post('/api/open', { itemId: 't.temp', kind: 'cmd' });
  assert.equal(r.status, 400);
});

test('recycle-bin/empty exige confirm e usa PowerShell injetado', async () => {
  assert.equal((await post('/api/recycle-bin/empty', {})).status, 400);
  calls = [];
  const r = await post('/api/recycle-bin/empty', { confirm: true });
  assert.equal(r.status, 200);
  assert.equal(typeof r.json.freed, 'number');
  assert.equal(calls[0][0], 'powershell.exe');
  assert.match(calls[0][1].join(' '), /Clear-RecycleBin -Force -DriveLetter C/);
});

test('GET /api/clean/:id inexistente: 404; sem token: 403', async () => {
  assert.equal((await api('/api/clean/j999')).status, 404);
  assert.equal((await request(srv.port, { method: 'POST', path: '/api/clean', body: {} })).status, 403);
});

test('caminho fora de todas as raízes do item falha com outside-root e nada é apagado', async () => {
  fillFixture();
  const victim = path.join(base, 'victim');
  const other = path.join(base, 'other');
  fs.mkdirSync(victim, { recursive: true });
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(path.join(victim, 'keep.txt'), 'x');
  srv.state.cleanup.items.set('t.outside', entry({ paths: [victim], roots: [other], method: 'trash' }));
  const r = await post('/api/clean', { items: [{ id: 't.outside', mode: 'delete' }] });
  const j = await job(r.json.jobId);
  assert.equal(j.items[0].status, 'failed');
  assert.equal(j.items[0].reason, 'outside-root');
  assert.ok(fs.existsSync(path.join(victim, 'keep.txt')));
});

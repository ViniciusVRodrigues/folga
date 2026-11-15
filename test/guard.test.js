import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkPath } from '../src/clean/guard.js';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-guard-'));
const win = process.env.WINDIR || 'C:\\Windows';
const sysRoot = path.parse(win).root;
const pf = process.env.ProgramFiles || 'C:\\Program Files';

test('protegidos são recusados', async () => {
  const cases = [
    sysRoot, win, path.join(win, 'System32'), pf, path.join(pf, 'x'),
    process.env.ProgramData || 'C:\\ProgramData', os.homedir(), path.join(os.homedir(), 'Documents'),
    path.join(sysRoot, '$Recycle.Bin'), path.join(sysRoot, 'System Volume Information'),
    path.join(sysRoot, 'pagefile.sys'), path.join(sysRoot, 'hiberfil.sys'), path.join(sysRoot, 'swapfile.sys'),
  ];
  for (const p of cases) {
    const r = await checkPath(p, { allowedRoot: sysRoot });
    assert.equal(r.ok, false, p);
    assert.equal(r.reason, 'protected', p);
  }
});

test('subpastas permitidas do Windows: só o conteúdo', async () => {
  const t = path.join(win, 'Temp');
  assert.equal((await checkPath(t, { allowedRoot: t })).reason, 'protected');
  const c = await checkPath(t, { allowedRoot: t, contents: true });
  assert.notEqual(c.reason, 'protected');
  assert.notEqual(c.reason, 'outside-root');
});

test('fora da raiz é recusado', async () => {
  fs.mkdirSync(path.join(base, 'a'), { recursive: true });
  fs.mkdirSync(path.join(base, 'b'), { recursive: true });
  fs.writeFileSync(path.join(base, 'b', 'f.txt'), 'x');
  const a = path.join(base, 'a');
  assert.equal((await checkPath(path.join(base, 'b', 'f.txt'), { allowedRoot: a })).reason, 'outside-root');
  assert.equal((await checkPath(path.join(base, 'ab'), { allowedRoot: a })).reason, 'outside-root');
  assert.equal((await checkPath(path.join(a, '..', 'b', 'f.txt'), { allowedRoot: a })).reason, 'outside-root');
});

test('arquivo normal passa; inexistente é not-found', async () => {
  const r = await checkPath(path.join(base, 'b', 'f.txt'), { allowedRoot: base });
  assert.deepEqual(r, { ok: true, isDir: false });
  assert.equal((await checkPath(path.join(base, 'b', 'nao.txt'), { allowedRoot: base })).reason, 'not-found');
});

test('junction no ancestral e no próprio alvo é recusada', async () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-out-'));
  fs.writeFileSync(path.join(outside, 'x.txt'), 'x');
  fs.symlinkSync(outside, path.join(base, 'link'), 'junction');
  assert.equal((await checkPath(path.join(base, 'link', 'x.txt'), { allowedRoot: base })).reason, 'reparse');
  assert.equal((await checkPath(path.join(base, 'link'), { allowedRoot: base })).reason, 'reparse');
  fs.rmdirSync(path.join(base, 'link'));
  fs.rmSync(outside, { recursive: true, force: true });
});

test('pasta Temp\\claude é pulada', async () => {
  const d = path.join(base, 'Temp', 'claude', 'x');
  fs.mkdirSync(d, { recursive: true });
  assert.equal((await checkPath(d, { allowedRoot: base })).reason, 'claude-temp');
});

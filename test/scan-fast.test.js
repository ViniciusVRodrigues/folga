import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildReaderScript, buildElevatedWrapper, createTreeBuilder, scanFast, FastUnavailable } from '../src/scan/fast.js';
import { encodeScript } from '../src/clean/admin.js';
import { scanTree } from '../src/scan/walk.js';

const isWin = process.platform === 'win32';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const ps = (script) => spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodeScript(script)], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });

test('o script do leitor só leva a pasta em base64', () => {
  const evil = "C:\\x'; Remove-Item -Recurse C:\\ ; '$(calc)`";
  const s = buildReaderScript({ sha: 'ab'.repeat(32), root: evil, out: 'C:\\t\\o', cancel: 'C:\\t\\c', largeFileMin: 1 });
  assert.ok(!s.includes('Remove-Item'), 'o caminho não pode aparecer em texto');
  assert.ok(s.includes(`'${b64(evil)}'`));
  assert.match(s, /exit 3/);
  const w = buildElevatedWrapper(s);
  assert.match(w, /-Verb RunAs/);
  assert.ok(!w.includes('Remove-Item'));
});

test('createTreeBuilder monta a árvore das linhas do leitor', () => {
  const root = path.resolve(os.tmpdir(), 'raiz');
  const b = createTreeBuilder(root, { largeFileMin: 100 });
  const tabName = '=' + b64('a\tb');
  for (const l of [
    'D\t0\t-1\t1000\t0\t1\t10\t4096\t',
    'D\t1\t0\t2000\t1\t0\t0\t0\tsem',
    `D\t2\t0\t3000\t0\t2\t300\t8192\t${tabName}`,
    'D\t3\t9\t0\t0\t0\t0\t0\torfa',
    'F\t2\t200\t4096\t5\t3\tgrande.iso',
    'F\t2\t50\t4096\t5\t2\tpequeno.bin',
    'F\t0\t10\t4096\t5\t1\tr.txt',
    `P\t3\t3\t310\t1\t${root}`,
    'E\terror\t' + '=' + b64('falhou\n'),
  ]) b.line(l);
  assert.equal(b.state.ended, 'error');
  assert.equal(b.state.error, 'falhou\n');
  assert.equal(b.state.progress.files, 3);
  const r = b.result();
  assert.equal(r.unreadable, 1);
  assert.equal(r.bytes, 310);
  assert.equal(r.root.children.length, 2);
  const ab = r.root.children.find((c) => c.name === 'a\tb');
  assert.ok(ab, 'nome com tab decodificado');
  assert.equal(ab.path, path.join(root, 'a\tb'));
  assert.equal(r.largeFiles.length, 1, 'só o grande e acima do mínimo');
  assert.equal(r.largeFiles[0].path, path.join(root, 'a\tb', 'grande.iso'));
  assert.ok(r.root.children.find((c) => c.name === 'sem').noAccess);
});

test('scanFast com o leitor recusado: FastUnavailable, e scanTree cai no walker em JS', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-fast-'));
  try {
    fs.writeFileSync(path.join(base, 'f'), 'x');
    const fail = () => spawn(process.execPath, ['-e', 'process.exit(5)'], { stdio: ['ignore', 'ignore', 'pipe'] });
    await assert.rejects(scanFast(base, { start: fail }), FastUnavailable);
    const r = await scanTree(base, { start: fail });
    assert.equal(r.backend, 'js');
    assert.equal(r.files, 1);
    await assert.rejects(scanTree(base, { start: fail, backend: 'fast' }), FastUnavailable);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('admin com UAC recusado devolve declined', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-fast-'));
  try {
    let script = '';
    const decline = (s) => { script = s; return spawn(process.execPath, ['-e', 'process.exit(1223)'], { stdio: ['ignore', 'ignore', 'pipe'] }); };
    const r = await scanFast(base, { admin: true, start: decline });
    assert.equal(r.declined, true);
    assert.equal(r.admin, true);
    assert.match(script, /-Verb RunAs/);
    const fail = () => spawn(process.execPath, ['-e', 'process.exit(1)'], { stdio: ['ignore', 'ignore', 'pipe'] });
    await assert.rejects(scanTree(base, { admin: true, start: fail }), (e) => !(e instanceof FastUnavailable));
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('leitor com código alterado (sha diferente) não roda', { skip: !isWin }, async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-fast-'));
  try {
    let code = null;
    const tamper = (s) => {
      const c = ps(s.replace(/if \(\$h -ne '[0-9a-f]+'\)/, "if ($h -ne '00')"));
      c.on('exit', (x) => { code = x; });
      return c;
    };
    await assert.rejects(scanFast(base, { start: tamper }), FastUnavailable);
    assert.equal(code, 3);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('leitor encerra sozinho se o processo pai morreu', { skip: !isWin, timeout: 60000 }, async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-fast-'));
  try {
    for (let i = 0; i < 5; i++) fs.mkdirSync(path.join(base, 'd' + i));
    let code = null;
    const orphan = (s) => {
      const c = ps(s.replace(`'${process.pid}'`, "'2147483000'"));
      c.on('exit', (x) => { code = x; });
      return c;
    };
    const r = await scanFast(base, { start: orphan });
    assert.notEqual(code, null);
    assert.equal(r.partial, true, 'saiu como cancelado');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('junção de pasta não é seguida', { skip: !isWin }, async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-fast-'));
  try {
    fs.mkdirSync(path.join(base, 'alvo'));
    fs.writeFileSync(path.join(base, 'alvo', 'f'), Buffer.alloc(1000));
    fs.symlinkSync(path.join(base, 'alvo'), path.join(base, 'jun'), 'junction');
    const r = await scanTree(base, { backend: 'fast' });
    assert.equal(r.backend, 'fast');
    assert.equal(r.bytes, 1000);
    assert.equal(r.files, 1);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

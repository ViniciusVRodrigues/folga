import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanTree } from '../src/scan/walk.js';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-walk-'));
const root = path.join(base, 'root');
const outside = path.join(base, 'outside');
const w = (p, n) => fs.writeFileSync(p, Buffer.alloc(n, 1));

before(() => {
  fs.mkdirSync(path.join(root, 'a'), { recursive: true });
  fs.mkdirSync(path.join(root, 'b'), { recursive: true });
  fs.mkdirSync(outside);
  w(path.join(root, 'root.txt'), 1);
  w(path.join(root, 'a', 'f1'), 1000);
  w(path.join(root, 'a', 'f2'), 5000);
  w(path.join(root, 'b', 'big'), 10000);
  w(path.join(outside, 'huge'), 100000);
  fs.symlinkSync(outside, path.join(root, 'link'), 'junction');
  w(path.join(root, 'h1'), 3000);
  fs.linkSync(path.join(root, 'h1'), path.join(root, 'h2'));
});
after(() => {
  fs.rmSync('\\\\?\\' + base, { recursive: true, force: true });
});

const ceil = (n) => Math.ceil(n / 4096) * 4096;

test('tamanhos exatos, alocado e ordem dos filhos; hardlink uma vez', async () => {
  const r = await scanTree(root, { onProgress() {} });
  const n = r.root;
  // arquivos contados: root.txt, f1, f2, big, h1 (h2 é o mesmo inode)
  assert.equal(n.size, 1 + 1000 + 5000 + 10000 + 3000);
  assert.equal(n.alloc, ceil(1) + ceil(1000) + ceil(5000) + ceil(10000) + ceil(3000));
  assert.equal(n.files, 5);
  assert.equal(n.dirs, 2);
  assert.deepEqual(n.children.map((c) => c.name), ['b', 'a']);
  assert.equal(n.children[0].size, 10000);
  assert.equal(n.children[1].size, 6000);
  assert.equal(r.partial, false);
  assert.equal(r.unreadable, 0);
  const top = n.topFiles.map((f) => f.name);
  assert.ok(top.includes('h1') !== top.includes('h2'), 'hardlink aparece uma vez');
  assert.equal(n.topFiles[0].size, 3000);
  assert.equal(n.otherFiles.count + n.topFiles.length, 2);
});

test('junction não é seguida (alvo externo não entra)', async () => {
  const r = await scanTree(root);
  assert.ok(r.root.size < 100000);
  assert.ok(!r.root.children.some((c) => c.name === 'link'));
});

test('arquivos grandes vão para a lista global', async () => {
  const r = await scanTree(root, { largeFileMin: 4000 });
  assert.deepEqual(r.largeFiles.map((f) => f.size).sort((a, b) => b - a), [10000, 5000]);
});

test('caminho com mais de 260 caracteres', async () => {
  const lroot = path.join(base, 'long');
  let p = lroot;
  while (p.length < 300) p = path.join(p, 'd'.repeat(40));
  fs.mkdirSync('\\\\?\\' + p, { recursive: true });
  fs.writeFileSync('\\\\?\\' + path.join(p, 'deep.bin'), Buffer.alloc(7777, 1));
  const r = await scanTree(lroot);
  assert.equal(r.root.size, 7777);
  assert.equal(r.unreadable, 0);
  assert.equal(r.files, 1);
});

test('signal já abortado devolve parcial', async () => {
  const ac = new AbortController();
  ac.abort();
  const r = await scanTree(root, { signal: ac.signal });
  assert.equal(r.partial, true);
});

test('aborto no meio devolve rápido', async () => {
  const many = path.join(base, 'many');
  for (let i = 0; i < 300; i++) {
    fs.mkdirSync(path.join(many, 'd' + i), { recursive: true });
    w(path.join(many, 'd' + i, 'x'), 10);
  }
  const ac = new AbortController();
  const t0 = Date.now();
  setImmediate(() => ac.abort());
  const r = await scanTree(many, { signal: ac.signal });
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(typeof r.partial, 'boolean');
});

test('pasta inexistente conta como não lida, sem estourar', async () => {
  const r = await scanTree(path.join(base, 'nao-existe'));
  assert.equal(r.unreadable, 1);
  assert.equal(r.root.noAccess, true);
});

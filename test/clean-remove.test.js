import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeTree } from '../src/clean/remove.js';

test('removeTree não segue junction: o alvo externo fica intacto', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-rm-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-rmout-'));
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  fs.mkdirSync(path.join(outside, 'sub'));
  fs.writeFileSync(path.join(outside, 'sub', 'k2.txt'), 'keep');
  const nm = path.join(base, 'node_modules');
  fs.mkdirSync(path.join(nm, 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(nm, 'pkg', 'i.js'), '1');
  fs.symlinkSync(outside, path.join(nm, 'pkg', 'jn'), 'junction');
  const r = await removeTree(nm);
  assert.deepEqual(r.failed, []);
  assert.equal(fs.existsSync(nm), false);
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
  assert.equal(fs.readFileSync(path.join(outside, 'sub', 'k2.txt'), 'utf8'), 'keep');
  fs.rmSync(base, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('removeTree trata caminho longo e arquivo somente leitura', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-rml-'));
  const first = path.join(base, 'pasta-bem-comprida-' + 'x'.repeat(30));
  let d = first;
  while (d.length < 330) d = path.join(d, 'pasta-bem-comprida-' + 'x'.repeat(30));
  const L = (p) => '\\\\?\\' + p;
  fs.mkdirSync(L(d), { recursive: true });
  fs.writeFileSync(L(path.join(d, 'ro.txt')), 'x');
  fs.chmodSync(L(path.join(d, 'ro.txt')), 0o444);
  const r = await removeTree(first);
  assert.deepEqual(r.failed, []);
  assert.deepEqual(fs.readdirSync(base), []);
  fs.rmSync(base, { recursive: true, force: true });
});

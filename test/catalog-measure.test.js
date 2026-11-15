import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { measure } from '../src/catalog/util.js';

// measure() roda para cada item do catálogo e antes/depois de cada limpeza:
// precisa ser o walker em JS, sem subir o leitor rápido (PowerShell + compilação) por pasta.
test('measure de pastas pequenas não sobe o leitor rápido', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-measure-'));
  try {
    const dirs = [];
    for (let i = 0; i < 8; i++) {
      const d = path.join(base, 'd' + i);
      fs.mkdirSync(d);
      fs.writeFileSync(path.join(d, 'f'), Buffer.alloc(5000));
      dirs.push(d);
    }
    const t0 = Date.now();
    const r = await measure(dirs);
    assert.equal(r.files, 8);
    assert.equal(r.logical, 40000);
    assert.equal(r.size, 8 * 8192);
    assert.ok(Date.now() - t0 < 1500, `levou ${Date.now() - t0} ms`);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

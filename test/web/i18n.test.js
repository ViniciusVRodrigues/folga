import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { messages } from '../../web/i18n/pt-BR.js';

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}
test('toda chave usada existe em pt-BR', () => {
  const missing = [];
  for (const f of walk('web')) {
    if (f.includes('i18n')) continue;
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b[tk]\(\s*'([^']+)'/g)) if (!(m[1] in messages)) missing.push(f + ': ' + m[1]);
  }
  assert.deepEqual(missing, []);
});
test('plurais têm one e other', () => {
  for (const [key, v] of Object.entries(messages)) {
    if (typeof v === 'object') assert.ok(v.one && v.other, key);
  }
});

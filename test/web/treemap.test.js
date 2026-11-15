import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squarify, groupSmall } from '../../web/lib/treemap.js';

const R = { x: 0, y: 0, w: 800, h: 500 };
const mk = (vals) => vals.map((v, i) => ({ id: 'i' + i, value: v }));

test('a soma das áreas é a área total', () => {
  const tiles = squarify(mk([500, 300, 200, 90, 50, 30, 10, 5]), R);
  const sum = tiles.reduce((a, t) => a + t.w * t.h, 0);
  assert.ok(Math.abs(sum - R.w * R.h) < 1);
});
test('nada sai dos limites', () => {
  for (const t of squarify(mk([900, 40, 40, 10, 5, 3, 1, 1]), R)) {
    assert.ok(t.x >= -1e-6 && t.y >= -1e-6 && t.x + t.w <= R.w + 1e-6 && t.y + t.h <= R.h + 1e-6);
  }
});
test('proporção razoável para valores parecidos', () => {
  for (const t of squarify(mk([10, 9, 8, 7, 6, 5, 4, 3]), R)) assert.ok(Math.max(t.w / t.h, t.h / t.w) < 6);
});
test('entrada vazia e zeros', () => {
  assert.deepEqual(squarify([], R), []);
  assert.deepEqual(squarify(mk([0, 0]), R), []);
});
test('groupSmall junta o que é muito pequeno', () => {
  const g = groupSmall(mk([1000, 1000, 1, 1]), 0.01);
  assert.equal(g.items.length, 2);
  assert.equal(g.rest.count, 2);
  assert.equal(g.rest.value, 2);
});

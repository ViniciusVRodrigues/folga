import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCleanup } from '../../web/lib/mock-api.js';
import { indexItems, safePreselect, createSelection, selectionTotals, buildRequest, buildModel, canConfirm, modeOf } from '../../web/lib/selection.js';

const categories = buildCleanup(Date.now());
const index = indexItems(categories);

test('pré-seleção segura nunca inclui médio, admin, guiado ou downloads', () => {
  const ids = safePreselect(categories);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const { item, category } = index.get(id);
    assert.equal(item.risk, 'low');
    assert.equal(item.action, 'clean');
    assert.ok(!item.needsAdmin);
    assert.notEqual(category.id, 'downloads');
  }
});
test('o total confere com a soma dos itens', () => {
  const sel = createSelection();
  const ids = safePreselect(categories);
  sel.replace(ids);
  const expected = ids.reduce((a, id) => a + index.get(id).item.size, 0);
  assert.deepEqual(selectionTotals(sel, index), { count: ids.length, size: expected });
});
test('pedido só leva itens selecionáveis e o modo vale só se regenerável', () => {
  const sel = createSelection();
  const all = [...index.keys()];
  sel.replace(all);
  for (const id of all) sel.setMode(id, 'delete');
  const req = buildRequest(sel, index);
  for (const r of req) {
    const it = index.get(r.id).item;
    assert.ok(it.action === 'clean' || it.action === 'admin');
    assert.notEqual(it.risk, 'high');
    if (r.mode === 'delete') assert.ok(it.regenerable && it.action === 'clean');
    assert.equal(r.mode, modeOf(sel, it));
  }
});
test('item médio exige confirmação explícita', () => {
  const med = [...index.values()].find((e) => e.item.risk === 'medium' && e.item.action === 'clean');
  assert.ok(med);
  const sel = createSelection();
  sel.add(med.item.id);
  const model = buildModel(sel, categories);
  assert.equal(model.needsAck, true);
  assert.equal(canConfirm(model, false), false);
  assert.equal(canConfirm(model, true), true);
});

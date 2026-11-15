import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureFraction } from '../../web/lib/measure.js';
import { messages } from '../../web/i18n/pt-BR.js';

test('fração da medição', () => {
  assert.equal(measureFraction(null), 0);
  assert.equal(measureFraction({ done: 0, total: 0 }), 0);
  assert.equal(measureFraction({ done: 7, total: 14 }), 0.5);
  assert.equal(measureFraction({ done: 20, total: 14 }), 1);
});
test('texto "Medindo… N de M" existe', () => {
  assert.match(messages['summary.measuring'], /\{done\}.*\{total\}/);
});

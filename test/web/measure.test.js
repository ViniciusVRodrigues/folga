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

import { measureText as mt } from '../../web/views/parts.js';
test('measureText mostra o que falta medir', () => {
  assert.match(mt({ done: 3, total: 9, pending: ['Steam', 'Docker e WSL'] }), /falta: Steam, Docker e WSL/);
});

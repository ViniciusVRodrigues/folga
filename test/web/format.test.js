import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatRelative, middleEllipsis, baseName } from '../../web/lib/format.js';

const norm = (s) => s.replace(/\u00a0/g, ' ');
test('bytes em base 1024', () => {
  assert.equal(norm(formatBytes(1024 ** 3)), '1 GB');
  assert.equal(norm(formatBytes(2.1 * 1024 ** 3)), '2,1 GB');
  assert.equal(norm(formatBytes(512)), '512 B');
});
test('datas relativas', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  assert.match(formatRelative('2026-11-14T08:00:00Z', now), /hoje/);
  assert.match(formatRelative('2026-11-13T08:00:00Z', now), /ontem/);
  assert.match(formatRelative('2026-08-01T00:00:00Z', now), /m[eê]s|meses/);
  assert.match(formatRelative('2024-01-01T00:00:00Z', now), /ano/);
});
test('reticências no meio', () => {
  const p = 'C:/Users/voce/AppData/Local/Google/Chrome/User Data/Default/Cache/Cache_Data';
  const r = middleEllipsis(p, 30);
  assert.ok(r.length <= 30);
  assert.ok(r.includes('…') && r.startsWith('C:') && r.endsWith('Cache_Data'));
  assert.equal(middleEllipsis('curto', 30), 'curto');
  assert.equal(baseName('C:/a/b/c.txt'), 'c.txt');
});

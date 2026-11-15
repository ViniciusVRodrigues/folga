import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCommand } from '../src/clean/commands.js';

test('comando fora da lista ou com argumento estranho é recusado sem executar', async () => {
  const calls = [];
  const exec = async (...a) => { calls.push(a); return { stdout: '', stderr: '' }; };
  assert.equal((await runCommand({ file: 'powershell', args: [] }, { exec })).ok, false);
  assert.equal((await runCommand({ file: 'npm', args: ['cache', '& calc'] }, { exec })).ok, false);
  assert.equal(calls.length, 0);
});

test('executável resolvido por where roda por execFile com os argumentos fixos', async () => {
  const calls = [];
  const exec = async (file, args) => {
    calls.push([file, args]);
    if (file === 'where') return { stdout: 'C:\\x\\uv.exe\r\n', stderr: '' };
    return { stdout: 'ok', stderr: '' };
  };
  const r = await runCommand({ file: 'uv', args: ['cache', 'clean'] }, { exec });
  assert.equal(r.ok, true);
  assert.deepEqual(calls[1], ['C:\\x\\uv.exe', ['cache', 'clean']]);
});

test('programa ausente e falha do comando viram motivo, sem fallback', async () => {
  const miss = async () => { throw new Error('nope'); };
  assert.equal((await runCommand({ file: 'go', args: ['clean', '-modcache'] }, { exec: miss })).reason, 'not-found');
  const exec = async (file) => {
    if (file === 'where') return { stdout: 'C:\\x\\go.exe', stderr: '' };
    const e = new Error('boom'); e.code = 2; throw e;
  };
  assert.equal((await runCommand({ file: 'go', args: ['clean', '-modcache'] }, { exec })).reason, 'command-failed');
});

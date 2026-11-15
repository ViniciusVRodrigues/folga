import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { startServer } from '../src/server.js';
import { request, waitFor } from './helpers.js';

// Usa a Lixeira de verdade com um único arquivo de nome único criado em temp.
test('item de teste vai para a Lixeira de verdade', { timeout: 120000 }, async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-real-'));
  const home = path.join(base, 'home');
  const env = {
    USERPROFILE: home, LOCALAPPDATA: path.join(home, 'AppData', 'Local'), APPDATA: path.join(home, 'AppData', 'Roaming'),
    TEMP: path.join(home, 'AppData', 'Local', 'Temp'), WINDIR: path.join(base, 'Windows'), ProgramData: path.join(base, 'PD'),
    'ProgramFiles(x86)': path.join(base, 'PF86'), ProgramFiles: path.join(base, 'PF'), SystemDrive: 'C:',
  };
  const uniq = 'folga-bin-' + crypto.randomUUID();
  const dir = path.join(base, 'tobin');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, uniq + '.txt');
  fs.writeFileSync(file, 'lixeira');
  const srv = await startServer({ port: 0, catalog: { env, devRoots: [], modelDirs: [] } });
  try {
    srv.state.cleanup.items = new Map([['real.item', { paths: [file], roots: [dir], method: 'trash', action: 'clean', needsAdmin: false, regenerable: false, size: 4096 }]]);
    const h = { 'X-Token': srv.token, 'Content-Type': 'application/json' };
    const r = await request(srv.port, { method: 'POST', path: '/api/clean', headers: h, body: { items: [{ id: 'real.item' }] } });
    assert.equal(r.status, 202);
    const j = await waitFor(async () => {
      const g = await request(srv.port, { path: '/api/clean/' + r.json.jobId, headers: h });
      return g.json.status === 'done' ? g.json : null;
    }, 90000);
    assert.equal(j.items[0].status, 'done', JSON.stringify(j));
    assert.ok(!fs.existsSync(file), 'o arquivo saiu do lugar');
    const ps = `$s=New-Object -ComObject Shell.Application;$n=$s.Namespace(10).Items()|Where-Object{$_.Name -like '*${uniq}*'}|Measure-Object;$n.Count`;
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', timeout: 60000 }).trim();
    console.log(`# Lixeira (Shell.Application) itens com o nome único: ${out}`);
    assert.equal(out, '1', 'o arquivo aparece na Lixeira');
  } finally {
    await srv.close();
    fs.rmSync(base, { recursive: true, force: true });
  }
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCatalog, buildResponse, buildCleanupMap } from '../src/catalog/index.js';
import { knownLocations } from '../src/platform/win32.js';
import { browserItems } from '../src/catalog/detectors.js';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-cat-'));
const home = path.join(base, 'home');
const env = {
  USERPROFILE: home, LOCALAPPDATA: path.join(home, 'AppData', 'Local'), APPDATA: path.join(home, 'AppData', 'Roaming'),
  TEMP: path.join(home, 'AppData', 'Local', 'Temp'), WINDIR: path.join(base, 'Windows'), ProgramData: path.join(base, 'ProgramData'),
  'ProgramFiles(x86)': path.join(base, 'PF86'), ProgramFiles: path.join(base, 'PF'), SystemDrive: 'C:',
};
const L = knownLocations(env);
const w = (p, n = 5000) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.alloc(n, 1)); };
const OLD = new Date('2020-01-01');
const opts = () => ({ env, devRoots: [path.join(home, 'src')], modelDirs: [], now: Date.now() });

before(() => {
  w(path.join(L.temp, 'a.tmp'));
  w(path.join(L.windir, 'Temp', 'x.tmp'));
  const chrome = path.join(L.localAppData, 'Google', 'Chrome', 'User Data', 'Default');
  for (const f of ['Cache/Cache_Data/d', 'Code Cache/js/c', 'GPUCache/g', 'Service Worker/CacheStorage/s', 'Cookies', 'Login Data', 'Local Storage/leveldb/l', 'IndexedDB/i/x', 'Web Data']) w(path.join(chrome, f));
  w(path.join(L.downloads, 'setup.exe'), 8000);
  w(path.join(L.downloads, 'novo.exe'), 8000);
  w(path.join(L.downloads, 'nota.txt'), 8000);
  fs.utimesSync(path.join(L.downloads, 'setup.exe'), OLD, OLD);
  // steam
  const steam = path.join(L.programFilesX86, 'Steam');
  const lib2 = path.join(base, 'SteamLibrary');
  fs.mkdirSync(path.join(lib2, 'steamapps'), { recursive: true });
  fs.mkdirSync(path.join(steam, 'steamapps'), { recursive: true });
  fs.writeFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'),
    `"libraryfolders" { "0" { "path" "${steam.replaceAll('\\', '\\\\')}" } "1" { "path" "${lib2.replaceAll('\\', '\\\\')}" } }`);
  fs.writeFileSync(path.join(lib2, 'steamapps', 'appmanifest_42.acf'),
    '"AppState" { "appid" "42" "name" "Jogo Teste" "installdir" "JogoTeste" "SizeOnDisk" "1000000" "LastPlayed" "1700000000" }');
  w(path.join(lib2, 'steamapps', 'common', 'JogoTeste', 'a.bin'));
  w(path.join(lib2, 'steamapps', 'shadercache', '42', 's'));
  // dev
  w(path.join(home, 'src', 'p', 'package.json'), 10);
  w(path.join(home, 'src', 'p', 'node_modules', 'm', 'i.js'));
});
after(() => fs.rmSync(base, { recursive: true, force: true }));

test('navegador: só Cache/Code Cache/GPUCache (baixo) e Service Worker (médio), nunca dados da pessoa', async () => {
  const items = await browserItems(L);
  const cache = items.find((i) => i.id.startsWith('browsers.chrome.cache:'));
  const site = items.find((i) => i.id.startsWith('browsers.chrome.sitedata:'));
  assert.equal(cache.risk, 'low');
  assert.equal(site.risk, 'medium');
  assert.equal(site.preselect, false);
  for (const p of items.flatMap((i) => [...i.paths, ...i.roots])) {
    assert.ok(!/Cookies|Login Data|Local Storage|IndexedDB|Web Data/i.test(p), p);
  }
});

test('refresh: itens medidos, ids e mapa do servidor', async () => {
  const r = await runCatalog(opts());
  const ids = r.items.map((i) => i.id);
  assert.ok(ids.includes('system.user-temp'));
  assert.ok(ids.includes('system.windows-temp'));
  assert.ok(ids.some((i) => /^dev\.node_modules:[0-9a-f]{12}$/.test(i)));
  const map = buildCleanupMap(r.items);
  const t = map.get('system.user-temp');
  assert.deepEqual(t.paths, [L.temp]);
  assert.equal(t.method, 'trash-contents');
  assert.ok(Array.isArray(t.roots));
});

test('todo item tem nome, o que é, depois de limpar, risco e ação', async () => {
  const r = await runCatalog(opts());
  assert.ok(r.items.length >= 8);
  for (const it of r.items) {
    for (const f of ['name', 'whatItIs', 'afterCleaning', 'risk', 'action']) assert.ok(typeof it[f] === 'string' && it[f].length > 0, `${it.id}.${f}`);
    assert.ok(['low', 'medium', 'high'].includes(it.risk));
    assert.ok(['clean', 'guided', 'admin'].includes(it.action));
    assert.equal(it.needsAdmin, it.action === 'admin');
  }
});

test('safeNow = soma de low, clean e sem admin; admin e guiados vão em needsDecision', async () => {
  const r = await runCatalog(opts());
  const res = buildResponse(r);
  const all = res.categories.flatMap((c) => c.items);
  const safe = all.filter((i) => i.risk === 'low' && i.action === 'clean' && !i.needsAdmin).reduce((s, i) => s + i.size, 0);
  const rest = all.reduce((s, i) => s + i.size, 0) - safe;
  assert.equal(res.summary.safeNow, safe);
  assert.equal(res.summary.needsDecision, rest);
  assert.ok(safe > 0 && rest > 0, JSON.stringify({ safe, rest, s: res.summary }));
  const admin = all.find((i) => i.id === 'system.windows-temp');
  assert.equal(admin.needsAdmin, true);
  assert.equal(admin.preselect, false);
});

test('pré-seleção nunca inclui médio, Downloads ou admin', async () => {
  const res = buildResponse(await runCatalog(opts()));
  for (const c of res.categories) for (const i of c.items) {
    if (i.preselect) assert.ok(i.risk === 'low' && !i.needsAdmin && c.id !== 'downloads', i.id);
  }
});

test('categorias vazias ficam ocultas e aparecem em checked', async () => {
  const res = buildResponse(await runCatalog(opts()));
  const names = res.categories.map((c) => c.id);
  assert.ok(!names.includes('apps'), 'apps não tem nada neste fixture');
  for (const g of ['NVIDIA', 'AMD', 'Steam', 'Chrome', 'Edge', 'Discord', 'Docker e WSL']) assert.ok(res.checked.includes(g), g);
  for (const c of res.categories) assert.ok(c.items.length > 0);
});

test('Steam: jogo guiado, com steam://uninstall e sem caminho de exclusão', async () => {
  const res = buildResponse(await runCatalog(opts()));
  const g = res.categories.find((c) => c.id === 'games').items[0];
  assert.equal(g.name, 'Jogo Teste');
  assert.equal(g.action, 'guided');
  assert.equal(g.game.appid, '42');
  assert.equal(g.guide.url, 'steam://uninstall/42');
  assert.equal(g.guide.open.target, 'steam://uninstall/42');
  assert.equal(g.size, 1000000);
  const map = buildCleanupMap((await runCatalog(opts())).items);
  assert.equal(map.get(g.id).method, null);
  assert.ok(res.categories.find((c) => c.id === 'graphics').items.some((i) => i.id === 'graphics.steam-shadercache'));
});

test('Downloads: só instalador antigo, médio, sem pré-seleção', async () => {
  const res = buildResponse(await runCatalog(opts()));
  const d = res.categories.find((c) => c.id === 'downloads').items;
  assert.deepEqual(d.map((i) => i.name), ['setup.exe']);
  assert.equal(d[0].risk, 'medium');
  assert.equal(d[0].regenerable, false);
  assert.equal(d[0].preselect, false);
});

import fs from 'node:fs';
import path from 'node:path';
import { measure, dynId, makeItem, listDirs, lstatSafe, readdirSafe, pathKey, isDir } from './util.js';
import { steamLibraries, parseAppManifest } from './vdf.js';
import { vhdxPaths } from './defs.js';

const j = path.join;
const DAY = 86400000;
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

/* ---------------- Navegadores ---------------- */

const CHROMIUM = [
  { key: 'chrome', name: 'Chrome', dir: (L) => j(L.localAppData, 'Google', 'Chrome', 'User Data') },
  { key: 'edge', name: 'Edge', dir: (L) => j(L.localAppData, 'Microsoft', 'Edge', 'User Data') },
  { key: 'brave', name: 'Brave', dir: (L) => j(L.localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data') },
];
const CACHE_DIRS = ['Cache', 'Code Cache', 'GPUCache'];
const SITE_DIRS = ['Service Worker', 'WebStorage'];

async function existing(paths) {
  const out = [];
  for (const p of paths) if (await isDir(p)) out.push(p);
  return out;
}

export async function browserItems(L) {
  const items = [];
  for (const b of CHROMIUM) {
    const profiles = await listDirs(b.dir(L), (n) => n === 'Default' || /^Profile \d+$/.test(n));
    for (const prof of profiles) {
      const pname = path.basename(prof);
      const cache = await existing(CACHE_DIRS.map((d) => j(prof, d)));
      const cm = cache.length ? await measure(cache) : null;
      if (cm && cm.size) {
        items.push(makeItem({
          id: dynId(`browsers.${b.key}.cache`, prof), category: 'browsers', group: b.name,
          name: `${b.name} (${pname}): cache`,
          whatItIs: 'Cópias de páginas, imagens e scripts que o navegador guarda para abrir sites mais rápido.',
          afterCleaning: 'Os sites carregam de novo e podem abrir mais devagar na primeira visita. Você continua logado.',
          risk: 'low', action: 'clean', method: 'trash-contents', regenerable: true, preselect: true,
          paths: cache, roots: [prof], size: cm.size, unreadable: cm.unreadable > 0,
        }));
      }
      const site = await existing(SITE_DIRS.map((d) => j(prof, d)));
      const sm = site.length ? await measure(site) : null;
      if (sm && sm.size) {
        items.push(makeItem({
          id: dynId(`browsers.${b.key}.sitedata`, prof), category: 'browsers', group: b.name,
          name: `${b.name} (${pname}): dados de sites offline`,
          whatItIs: 'Dados que sites guardam no navegador para funcionar offline e abrir rápido (Service Worker e WebStorage).',
          afterCleaning: 'Alguns sites perdem dados salvos localmente e funcionam sem internet só depois de abrir de novo. Senhas e cookies não são tocados.',
          risk: 'medium', action: 'clean', method: 'trash-contents', regenerable: false, preselect: false,
          paths: site, roots: [prof], size: sm.size, unreadable: sm.unreadable > 0,
        }));
      }
    }
  }
  // Firefox: cache fica em Local, por perfil
  const ffProfiles = await listDirs(j(L.localAppData, 'Mozilla', 'Firefox', 'Profiles'));
  for (const prof of ffProfiles) {
    const cache = await existing([j(prof, 'cache2')]);
    const fm = cache.length ? await measure(cache) : null;
    if (!fm || !fm.size) continue;
    items.push(makeItem({
      id: dynId('browsers.firefox.cache', prof), category: 'browsers', group: 'Firefox',
      name: `Firefox (${path.basename(prof)}): cache`,
      whatItIs: 'Cópias de páginas e imagens que o navegador guarda para abrir sites mais rápido.',
      afterCleaning: 'Os sites carregam de novo e podem abrir mais devagar na primeira visita. Você continua logado.',
      risk: 'low', action: 'clean', method: 'trash-contents', regenerable: true, preselect: true,
      paths: cache, roots: [prof], size: fm.size, unreadable: fm.unreadable > 0,
    }));
  }
  return items;
}

/** Grupos verificados por `browserItems`, mesmo quando vazios. */
export const BROWSER_GROUPS = ['Chrome', 'Edge', 'Brave', 'Firefox'];

/* ---------------- Steam ---------------- */

export async function steamLibrariesOf(L, steamRoots) {
  const roots = steamRoots || [j(L.programFilesX86, 'Steam'), j(L.programFiles, 'Steam')];
  const libs = new Map();
  for (const r of roots) {
    if (!(await isDir(r))) continue;
    libs.set(pathKey(r), r);
    let text = '';
    try { text = await fs.promises.readFile(j(r, 'steamapps', 'libraryfolders.vdf'), 'utf8'); } catch { /* sem arquivo */ }
    for (const p of steamLibraries(text)) if (!libs.has(pathKey(p))) libs.set(pathKey(p), p);
  }
  const out = [];
  for (const lib of libs.values()) if (await isDir(j(lib, 'steamapps'))) out.push(lib);
  return out;
}

export async function steamGames(libs) {
  const items = [];
  for (const lib of libs) {
    const apps = j(lib, 'steamapps');
    const ents = await readdirSafe(apps);
    for (const e of ents || []) {
      if (!e.isFile() || !/^appmanifest_\d+\.acf$/i.test(e.name)) continue;
      let text;
      try { text = await fs.promises.readFile(j(apps, e.name), 'utf8'); } catch { continue; }
      const g = parseAppManifest(text);
      if (!g) continue;
      const dir = j(apps, 'common', g.installdir || g.name);
      let size = g.sizeOnDisk;
      if (!size && g.installdir) size = (await measure([dir])).size;
      if (!size) continue;
      const lastPlayed = g.lastPlayed ? g.lastPlayed * 1000 : null;
      const target = `steam://uninstall/${g.appid}`;
      items.push(makeItem({
        id: dynId('games.steam', dir), category: 'games', group: 'Steam',
        name: g.name,
        whatItIs: 'Jogo instalado pela Steam. O app não apaga nada: a Steam faz a desinstalação.',
        afterCleaning: 'O jogo sai do disco. Seus saves na nuvem da Steam continuam e você pode instalar de novo.',
        risk: 'medium', action: 'guided', method: null, regenerable: false, preselect: false,
        paths: [dir], roots: [apps], size, lastUsed: iso(lastPlayed),
        game: { appid: g.appid, library: lib, lastPlayed: iso(lastPlayed) },
        guide: {
          steps: ['O app abre a Steam na tela de desinstalar.', 'Confirme lá. Para só mudar o jogo de disco, use "Mover na Steam".'],
          open: { kind: 'steam', target }, url: target,
        },
      }));
    }
  }
  return items;
}

export async function steamShaderItem(libs) {
  const paths = (await existing(libs.map((l) => j(l, 'steamapps', 'shadercache'))));
  if (!paths.length) return [];
  const m = await measure(paths);
  return [makeItem({
    id: 'graphics.steam-shadercache', category: 'graphics', group: 'Steam', name: 'Cache de shaders da Steam',
    whatItIs: 'Peças de gráficos já prontas que a Steam guarda para os jogos carregarem mais rápido.',
    afterCleaning: 'Os jogos refazem o cache e podem demorar um pouco mais na primeira abertura.',
    risk: 'low', action: 'clean', method: 'trash-contents', regenerable: true, preselect: true,
    paths, size: m.size, unreadable: m.unreadable > 0,
  })];
}

/* ---------------- Downloads ---------------- */

const DL_RE = /\.(exe|msi|zip|iso|7z)$/i;

export async function downloadItems(L, now = Date.now()) {
  const ents = await readdirSafe(L.downloads);
  const items = [];
  for (const e of ents || []) {
    if (!e.isFile() || !DL_RE.test(e.name)) continue;
    const p = j(L.downloads, e.name);
    const st = await lstatSafe(p);
    if (!st || now - st.mtimeMs < 30 * DAY) continue;
    const m = await measure([p]);
    items.push(makeItem({
      id: dynId('downloads.old-file', p), category: 'downloads', group: 'Downloads',
      name: e.name,
      whatItIs: 'Instalador ou arquivo compactado baixado há mais de 30 dias.',
      afterCleaning: 'Vai para a Lixeira. Se precisar de novo, é preciso baixar outra vez. Confira se não é algo só seu.',
      risk: 'medium', action: 'clean', method: 'trash', regenerable: false, preselect: false,
      paths: [p], roots: [L.downloads], size: m.size, lastUsed: iso(st.mtimeMs),
    }));
  }
  return items;
}

/* ---------------- Docker e WSL ---------------- */

export async function vhdxItems(L) {
  const items = [];
  for (const v of await vhdxPaths(L)) {
    const st = await lstatSafe(v.path);
    if (!st) continue;
    const m = await measure([v.path]);
    const docker = v.kind === 'docker';
    items.push(makeItem({
      id: dynId('dev.vhdx', v.path), category: 'dev', group: 'Docker e WSL',
      name: docker ? 'Disco virtual do Docker (docker_data.vhdx)' : `Disco virtual do WSL (${path.basename(path.dirname(path.dirname(v.path)))})`,
      whatItIs: docker
        ? 'Arquivo onde o Docker guarda imagens e volumes. Ele cresce, mas não encolhe sozinho quando você limpa por dentro.'
        : 'Arquivo que é o disco de uma distribuição Linux do WSL. Cresce com o uso e não encolhe sozinho.',
      afterCleaning: 'Não se apaga: limpe por dentro e compacte o arquivo para devolver o espaço. Apagar o arquivo perde tudo que está dentro.',
      risk: 'high', action: 'guided', method: null, regenerable: false, preselect: false,
      paths: [v.path], roots: [path.dirname(v.path)], size: m.size, lastUsed: iso(st.mtimeMs),
      guide: {
        steps: [
          ...(docker ? ['Limpe o que o Docker não usa: rode o comando abaixo (confira antes o que será removido).'] : ['Dentro da distribuição, apague o que não precisa mais.']),
          'Feche o Docker e os terminais do WSL, e rode "wsl --shutdown".',
          'Abra o PowerShell como administrador, rode "diskpart" e use: select vdisk file="' + v.path + '" e depois compact vdisk.',
        ],
        copy: docker ? 'docker system prune' : 'wsl --shutdown',
        open: { kind: 'explorer', target: path.dirname(v.path) },
      },
    }));
  }
  return items;
}

import fs from 'node:fs';
import path from 'node:path';
import { knownLocations as realLocations } from '../platform/index.js';
import { knownLocations as winLocations } from '../platform/win32.js';
import { CATEGORIES, STATIC_DEFS } from './defs.js';
import { measure, makeItem, isDir, pathKey } from './util.js';
import { scanDevRoots, projectItems, fileItems, scanFiles } from './dev.js';
import {
  browserItems, BROWSER_GROUPS, steamLibrariesOf, steamGames, steamShaderItem, downloadItems, vhdxItems,
} from './detectors.js';

const j = path.join;
export { CATEGORIES };

/** Raízes padrão de projetos: C:\GitHub (se existir) e pastas comuns do perfil. */
export function defaultDevRoots(L) {
  const roots = [];
  const gh = j(L.systemDrive + '\\', 'GitHub');
  roots.push(gh);
  for (const d of ['source/repos', 'projects', 'dev', 'code']) roots.push(j(L.home, ...d.split('/')));
  return roots;
}

async function resolve(v, L) {
  return typeof v === 'function' ? v(L) : v;
}

async function staticItem(def, L) {
  const paths = (await resolve(def.paths, L)) || [];
  if (!paths.length) return [];
  const m = await measure(paths, { budgetMs: def.budgetMs });
  if (!m.size) return [];
  const roots = def.roots ? await resolve(def.roots, L) : paths;
  return [makeItem({ ...def, paths, roots, size: m.size, unreadable: m.unreadable > 0 || m.partial })];
}

/**
 * Mede o catálogo inteiro. Opções (todas injetáveis nos testes):
 * { env, devRoots, steamRoots, modelDirs, now, onProgress({category, done, total}), signal }
 */
export async function runCatalog(opts = {}) {
  const env = opts.env || process.env;
  const L = (process.platform === 'win32' ? realLocations : winLocations)(env);
  const now = opts.now ?? Date.now();
  const devRoots = (opts.devRoots || defaultDevRoots(L));
  const modelDirs = opts.modelDirs || [
    j(L.home, '.cache', 'huggingface'), j(L.home, '.ollama'), j(L.home, 'Hermes'), j(L.home, 'Rocky'), j(L.home, 'models'), j(L.home, '.lmstudio'),
    j(L.appData, 'Code', 'User', 'workspaceStorage'),
  ];

  const detectors = []; // { category, groups[], run }
  for (const def of STATIC_DEFS) detectors.push({ category: def.category, groups: [def.group], run: () => staticItem(def, L) });
  detectors.push({ category: 'browsers', groups: BROWSER_GROUPS, run: () => browserItems(L) });
  const libsP = steamLibrariesOf(L, opts.steamRoots);
  detectors.push({ category: 'games', groups: ['Steam'], run: async () => steamGames(await libsP) });
  detectors.push({ category: 'graphics', groups: ['Steam'], run: async () => steamShaderItem(await libsP) });
  detectors.push({ category: 'downloads', groups: ['Downloads'], run: () => downloadItems(L, now) });
  detectors.push({ category: 'dev', groups: ['Docker e WSL'], run: () => vhdxItems(L) });
  detectors.push({
    category: 'dev', groups: ['Projetos de dev', 'Dumps de memória', 'Modelos de IA'],
    run: async () => {
      const existing = [];
      for (const r of devRoots) if (await isDir(r)) existing.push(r);
      const found = await scanDevRoots(existing);
      const extra = await scanFiles(modelDirs);
      const seen = new Set(found.files.map((f) => pathKey(f.path)));
      const files = [...found.files, ...extra.filter((f) => !seen.has(pathKey(f.path)))];
      return [...(await projectItems(found.artifacts, { now })), ...(await fileItems(files))];
    },
  });

  const total = detectors.length;
  let done = 0;
  const all = [];
  await Promise.all(detectors.map(async (d) => {
    let items = [];
    try { items = await d.run(); } catch { items = []; }
    all.push(...items);
    done++;
    opts.onProgress?.({ category: d.category, done, total });
  }));

  const checked = [];
  for (const d of detectors) for (const g of d.groups) if (!checked.includes(g)) checked.push(g);

  // IDs repetidos (mesmo caminho achado duas vezes) ficam com o primeiro
  const byId = new Map();
  for (const it of all) if (!byId.has(it.id)) byId.set(it.id, it);

  return { generatedAt: new Date(now).toISOString(), items: [...byId.values()], checked };
}

const isSafe = (it) => it.risk === 'low' && it.action === 'clean' && !it.needsAdmin;

/** Monta a resposta de `GET /api/cleanup` (categorias vazias ficam de fora). */
export function buildResponse(result, { drive = null, scanning = false } = {}) {
  let safeNow = 0;
  let needsDecision = 0;
  const categories = [];
  for (const cat of CATEGORIES) {
    const items = result.items.filter((i) => i.category === cat.id);
    if (!items.length) continue;
    items.sort((a, b) => b.size - a.size);
    const counts = { safe: 0, admin: 0, decision: 0 };
    let size = 0;
    for (const it of items) {
      size += it.size;
      if (isSafe(it)) { counts.safe++; safeNow += it.size; } else { needsDecision += it.size; if (it.needsAdmin) counts.admin++; else counts.decision++; }
    }
    categories.push({
      id: cat.id, name: cat.name, size, counts, scanning,
      items: items.map(publicItem),
    });
  }
  return { generatedAt: result.generatedAt, drive, summary: { safeNow, needsDecision }, checked: result.checked, categories };
}

/** Campos do item que vão ao cliente (o mapa de limpeza fica só no servidor). */
export function publicItem(it) {
  const out = {
    id: it.id, name: it.name, whatItIs: it.whatItIs, afterCleaning: it.afterCleaning,
    size: it.size, risk: it.risk, action: it.action, needsAdmin: it.needsAdmin, preselect: it.preselect,
    paths: it.paths, lastUsed: it.lastUsed, permanent: it.permanent, regenerable: it.regenerable,
    inUseBy: it.inUseBy, guide: it.guide, unreadable: it.unreadable,
  };
  if (it.project) out.project = it.project;
  if (it.game) out.game = it.game;
  return out;
}

/** Mapa `id -> { paths, roots, method, command, ... }` para a limpeza revalidar no P3. */
export function buildCleanupMap(items) {
  const map = new Map();
  for (const it of items) {
    map.set(it.id, {
      paths: it.paths, roots: it.roots, method: it.method, command: it.command,
      action: it.action, needsAdmin: it.needsAdmin, regenerable: it.regenerable, size: it.size,
    });
  }
  return map;
}

export async function systemDrive(L) {
  try {
    const root = L.systemDrive.toUpperCase() + '\\';
    const s = await fs.promises.statfs(root);
    return { root, total: Number(s.bsize) * Number(s.blocks), free: Number(s.bsize) * Number(s.bavail) };
  } catch { return null; }
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { toLongPath, pathKey } from '../scan/walk.js';

const CLUSTER = 4096n;

export function createLimiter(n) {
  let active = 0;
  // Fila com ponteiro de cabeça: `shift()` num array com milhões de itens é O(n)
  // e deixava a medição de node_modules quadrática.
  let q = [];
  let head = 0;
  const next = () => {
    while (active < n && head < q.length) {
      const { fn, res, rej } = q[head];
      q[head++] = undefined;
      if (head > 4096 && head * 2 > q.length) { q = q.slice(head); head = 0; }
      active++;
      fn().then(res, rej).finally(() => { active--; next(); });
    }
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}

/** Limitador compartilhado por todas as leituras do catálogo. */
export const limit = createLimiter(48);

export const sha12 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

/** `<catalogId>:<sha1(caminho em minúsculas)[0..12]>` */
export const dynId = (catalogId, p) => `${catalogId}:${sha12(p.toLowerCase())}`;

export async function lstatSafe(p) {
  try { return await limit(() => fs.promises.lstat(toLongPath(p))); } catch { return null; }
}

export async function readdirSafe(p) {
  try { return await limit(() => fs.promises.readdir(toLongPath(p), { withFileTypes: true })); } catch { return null; }
}

export async function isDir(p) {
  const st = await lstatSafe(p);
  return !!st && st.isDirectory() && !st.isSymbolicLink();
}

/** Subpastas (nome) de `dir` que passam no filtro. */
export async function listDirs(dir, filter = () => true) {
  const ents = await readdirSafe(dir);
  if (!ents) return [];
  return ents.filter((e) => e.isDirectory() && !e.isSymbolicLink() && filter(e.name)).map((e) => path.join(dir, e.name));
}

/** Arquivos diretos de `dir` cujo nome passa no regex. */
export async function listFiles(dir, re) {
  const ents = await readdirSafe(dir);
  if (!ents) return [];
  return ents.filter((e) => e.isFile() && re.test(e.name)).map((e) => path.join(dir, e.name));
}

/**
 * Soma o tamanho alocado (clusters de 4 KiB) de arquivos e pastas, sem seguir
 * links nem junctions. Devolve { size, logical, files, unreadable, newest }.
 */
export async function measure(paths, { budgetMs } = {}) {
  const deadline = budgetMs ? Date.now() + budgetMs : Infinity;
  const total = { size: 0, logical: 0, files: 0, unreadable: 0, newest: 0, partial: false };
  const seen = new Set();
  async function lst(p) {
    try { return await limit(() => fs.promises.lstat(toLongPath(p), { bigint: true })); } catch (e) { return { err: e }; }
  }
  function addFile(st) {
    if (st.nlink > 1n) {
      const k = `${st.dev}:${st.ino}`;
      if (seen.has(k)) return;
      seen.add(k);
    }
    total.logical += Number(st.size);
    total.size += Number(((st.size + CLUSTER - 1n) / CLUSTER) * CLUSTER);
    total.files++;
    total.newest = Math.max(total.newest, Number(st.mtimeMs));
  }
  async function dir(p) {
    if (Date.now() > deadline) { total.partial = true; return; }
    let ents;
    try { ents = await limit(() => fs.promises.readdir(toLongPath(p), { withFileTypes: true })); } catch { total.unreadable++; return; }
    const subs = [];
    const files = [];
    for (const e of ents) {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) subs.push(path.join(p, e.name));
      else files.push(path.join(p, e.name));
    }
    await Promise.all([
      ...subs.map(dir),
      ...files.map(async (f) => {
        const st = await lst(f);
        if (st.err) { total.unreadable++; return; }
        if (!st.isSymbolicLink() && !st.isDirectory()) addFile(st);
      }),
    ]);
  }
  await Promise.all(paths.map(async (p) => {
    const st = await lst(p);
    if (st.err) { if (st.err.code !== 'ENOENT' && st.err.code !== 'ENOTDIR') total.unreadable++; return; }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) await dir(p); else addFile(st);
  }));
  return total;
}

/**
 * Percorre pastas até `maxDepth`, sem seguir links. `onDir(dir, entries, depth)`
 * devolve um Set de nomes de subpastas que NÃO devem ser visitadas.
 */
export async function walkLite(root, { maxDepth = 8, onDir }) {
  async function visit(dir, depth) {
    const ents = await readdirSafe(dir);
    if (!ents) return;
    const skip = (await onDir(dir, ents, depth)) || new Set();
    if (depth >= maxDepth) return;
    await Promise.all(ents
      .filter((e) => e.isDirectory() && !e.isSymbolicLink() && !skip.has(e.name))
      .map((e) => visit(path.join(dir, e.name), depth + 1)));
  }
  await visit(root, 0);
}

/** Item completo, com os padrões. */
export function makeItem(def) {
  const action = def.action || 'clean';
  const it = {
    risk: 'low', regenerable: false, preselect: false, lastUsed: null, inUseBy: [], guide: null, unreadable: false,
    permanent: false, method: null, roots: null, command: null,
    ...def,
    action,
    needsAdmin: action === 'admin',
  };
  if (!it.roots) it.roots = it.paths;
  return it;
}

export { pathKey };

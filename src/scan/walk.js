import fs from 'node:fs';
import path from 'node:path';

const CLUSTER = 4096n;
const TOP_FILES = 50;
const LONG_LIMIT = 240;

export const isWin = process.platform === 'win32';

/** Chave de comparação de caminhos (sem distinguir maiúsculas no Windows). */
export function pathKey(p) {
  let k = path.resolve(p);
  const root = path.parse(k).root;
  if (k.length > root.length) k = k.replace(/[\\/]+$/, '');
  return isWin ? k.toLowerCase() : k;
}

/** Prefixo \\?\ para caminhos absolutos longos (só Windows). */
export function toLongPath(p) {
  if (!isWin || p.length <= LONG_LIMIT || p.startsWith('\\\\?\\')) return p;
  if (p.startsWith('\\\\')) return '\\\\?\\UNC\\' + p.slice(2);
  return '\\\\?\\' + p;
}

const NO_ACCESS = new Set(['EPERM', 'EACCES', 'EBUSY']);

export function newNode(name, p) {
  return {
    name, path: p, size: 0, alloc: 0, files: 0, dirs: 0,
    children: [], topFiles: [], otherFiles: { count: 0, size: 0 },
    noAccess: false, mtime: 0,
    directFiles: 0, directSize: 0,
  };
}

/**
 * Varre `root`. Devolve
 * { root, index, largeFiles, files, dirs, bytes, unreadable, elapsedMs, partial, backend, admin, declined }.
 * backend: 'auto' (leitor rápido no Windows, JS se ele não iniciar), 'fast' ou 'js'.
 * admin: true sobe só o leitor pelo UAC (Windows); recusado, devolve { declined: true }.
 */
export async function scanTree(root, opts = {}) {
  const { backend = 'auto', admin = false } = opts;
  if (admin || backend === 'fast' || (backend === 'auto' && isWin)) {
    const { scanFast, FastUnavailable } = await import('./fast.js');
    try {
      return await scanFast(root, opts);
    } catch (e) {
      if (!(e instanceof FastUnavailable) || admin || backend === 'fast') throw e;
    }
  }
  return walkJs(root, opts);
}

/** Walker em JS (readdir + lstat), usado fora do Windows e como alternativa. */
export async function walkJs(root, { signal, onProgress, concurrency = 64, largeFileMin = 500 * 1024 ** 2 } = {}) {
  const t0 = Date.now();
  const rootPath = path.resolve(root);
  const rootNode = newNode(path.basename(rootPath) || rootPath, rootPath);
  const order = [rootNode]; // pais sempre antes dos filhos
  const queue = [rootNode];
  const seenLinks = new Set();
  const largeFiles = [];
  const stats = { files: 0, dirs: 0, bytes: 0, unreadable: 0, current: rootPath };
  let active = 0;
  let aborted = !!signal?.aborted;

  const timer = onProgress
    ? setInterval(() => {
      onProgress({ ...stats, elapsedMs: Date.now() - t0 });
    }, 250)
    : null;
  timer?.unref?.();

  async function processDir(node) {
    const full = toLongPath(node.path);
    stats.current = node.path;
    try {
      const st = await fs.promises.lstat(full, { bigint: true });
      node.mtime = Number(st.mtimeMs);
    } catch (e) {
      if (NO_ACCESS.has(e.code) || e.code === 'ENOENT') { node.noAccess = true; stats.unreadable++; return; }
    }
    let entries;
    try {
      entries = await fs.promises.readdir(full, { withFileTypes: true });
    } catch (e) {
      node.noAccess = true;
      stats.unreadable++;
      return;
    }
    const fileEntries = [];
    for (const ent of entries) {
      if (ent.isSymbolicLink()) continue; // inclui junction
      if (ent.isDirectory()) {
        const child = newNode(ent.name, path.join(node.path, ent.name));
        node.children.push(child);
        order.push(child);
        queue.push(child);
      } else {
        fileEntries.push(ent);
      }
    }
    for (let i = 0; i < fileEntries.length; i += 8) {
      if (aborted) return;
      const batch = fileEntries.slice(i, i + 8);
      const res = await Promise.all(batch.map(async (ent) => {
        const fp = path.join(node.path, ent.name);
        try {
          return { ent, fp, st: await fs.promises.lstat(toLongPath(fp), { bigint: true }) };
        } catch (e) {
          node.noAccess = node.noAccess || NO_ACCESS.has(e.code);
          stats.unreadable++;
          return null;
        }
      }));
      for (const r of res) {
        if (!r) continue;
        const { ent, fp, st } = r;
        if (st.isSymbolicLink() || st.isDirectory()) continue;
        if (st.nlink > 1n) {
          const k = `${st.dev}:${st.ino}`;
          if (seenLinks.has(k)) continue;
          seenLinks.add(k);
        }
        const size = Number(st.size);
        const alloc = Number(((st.size + CLUSTER - 1n) / CLUSTER) * CLUSTER);
        const mtime = Number(st.mtimeMs);
        node.directFiles++;
        node.directSize += size;
        node.size += size;
        node.alloc += alloc;
        stats.files++;
        stats.bytes += size;
        node.topFiles.push({ name: ent.name, size, alloc, mtime });
        if (node.topFiles.length > TOP_FILES * 2) {
          node.topFiles.sort((a, b) => b.size - a.size);
          node.topFiles.length = TOP_FILES;
        }
        if (size >= largeFileMin) largeFiles.push({ path: fp, size, mtime, ext: path.extname(ent.name).toLowerCase() });
      }
    }
    stats.dirs += node.children.length;
  }

  await new Promise((resolve) => {
    const onAbort = () => { aborted = true; pump(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    function pump() {
      if (signal?.aborted) aborted = true;
      while (!aborted && active < concurrency && queue.length) {
        const node = queue.pop();
        active++;
        processDir(node).catch(() => { node.noAccess = true; stats.unreadable++; }).finally(() => {
          active--;
          pump();
        });
      }
      if (active === 0 && (aborted || queue.length === 0)) {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }
    }
    pump();
  });
  if (timer) clearInterval(timer);

  const r = finalize(rootNode, order, largeFiles);
  return { ...r, unreadable: stats.unreadable, elapsedMs: Date.now() - t0, partial: aborted, backend: 'js', admin: false };
}

/** Fecha a árvore: corta os maiores arquivos, soma os totais (pais antes dos filhos em `order`) e indexa. */
export function finalize(rootNode, order, largeFiles) {
  for (const n of order) {
    n.topFiles.sort((a, b) => b.size - a.size);
    if (n.topFiles.length > TOP_FILES) n.topFiles.length = TOP_FILES;
    const topSize = n.topFiles.reduce((s, f) => s + f.size, 0);
    n.otherFiles = { count: n.directFiles - n.topFiles.length, size: n.directSize - topSize };
    n.files = n.directFiles;
    n.dirs = n.children.length;
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    for (const c of n.children) {
      n.size += c.size;
      n.alloc += c.alloc;
      n.files += c.files;
      n.dirs += c.dirs;
    }
    n.children.sort((a, b) => b.size - a.size);
  }
  largeFiles.sort((a, b) => b.size - a.size);

  const index = new Map();
  for (const n of order) index.set(pathKey(n.path), n);

  return { root: rootNode, index, largeFiles, files: rootNode.files, dirs: rootNode.dirs, bytes: rootNode.size };
}

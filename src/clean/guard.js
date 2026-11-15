import fs from 'node:fs';
import path from 'node:path';
import { knownLocations as realLocations } from '../platform/index.js';
import { knownLocations as winLocations } from '../platform/win32.js';

const realNative = (p) => new Promise((res, rej) => fs.realpath.native(p, (e, r) => (e ? rej(e) : res(r))));
const low = (p) => path.resolve(p).toLowerCase();
const sep = path.sep;

/** Subpastas de %WINDIR% que podem ser limpas (só o conteúdo). */
export const WINDIR_ALLOWED = ['Temp', 'SoftwareDistribution\\Download', 'Prefetch', 'Logs', 'Minidump'];
const HOME_FIRST_LEVEL = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music', 'OneDrive', 'AppData', 'Favorites', 'Contacts', 'Links', 'Saved Games', 'Searches', '3D Objects'];
const PROTECTED_NAMES = new Set(['$recycle.bin', 'system volume information', 'pagefile.sys', 'hiberfil.sys', 'swapfile.sys']);

export function locationsFor(env) {
  return (process.platform === 'win32' ? realLocations : winLocations)(env || process.env);
}

/** true se `p` é igual a `root` ou está dentro dele (sem distinguir maiúsculas). */
export function isInside(p, root) {
  const a = low(p);
  const r = low(root).replace(/[\\/]+$/, '');
  return a === r || a.startsWith(r + sep);
}

/** Só lógica de nomes (sem disco). Devolve o motivo da recusa ou null. */
export function protectedReason(p, { env, contents = false } = {}) {
  const L = locationsFor(env);
  const abs = path.resolve(p);
  const a = low(abs);
  const parsed = path.parse(abs);
  if (a === parsed.root.toLowerCase()) return 'protected';
  const parts = a.slice(parsed.root.length).split(sep).filter(Boolean);
  if (parts.some((s) => PROTECTED_NAMES.has(s))) return 'protected';
  for (let i = 0; i + 1 < parts.length; i++) if (parts[i] === 'temp' && parts[i + 1] === 'claude') return 'claude-temp';
  for (const pf of [L.programFiles, L.programFilesX86, path.join(parsed.root, 'Program Files'), path.join(parsed.root, 'Program Files (x86)')]) {
    if (pf && isInside(abs, pf)) return 'protected';
  }
  if (a === low(L.programData)) return 'protected';
  if (a === low(L.home)) return 'protected';
  for (const d of HOME_FIRST_LEVEL) if (a === low(path.join(L.home, d))) return 'protected';
  if (a === low(L.appData) || a === low(L.localAppData)) return 'protected';
  if (isInside(abs, L.windir)) {
    const ok = WINDIR_ALLOWED.some((s) => {
      const root = path.join(L.windir, s);
      return contents ? isInside(abs, root) : isInside(abs, root) && a !== low(root);
    });
    if (!ok) return 'protected';
  }
  return null;
}

function inUseCode(e) {
  return e && (e.code === 'EBUSY' || e.code === 'ETXTBSY');
}

/**
 * Revalida `p` antes de remover. Devolve { ok:true, isDir } ou { ok:false, reason }.
 * Motivos: not-found, reparse, outside-root, protected, claude-temp, in-use, access-denied.
 * `contents: true` quando `p` é a raiz de um item de "conteúdo" (a pasta em si não será removida).
 */
export async function checkPath(p, { allowedRoot, env, contents = false } = {}) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || !allowedRoot) return { ok: false, reason: 'protected' };
  const abs = path.resolve(p);
  const root = path.resolve(allowedRoot);
  if (!isInside(abs, root)) return { ok: false, reason: 'outside-root' };
  const pr = protectedReason(abs, { env, contents });
  if (pr) return { ok: false, reason: pr };
  // da raiz permitida até o alvo: nenhum componente pode ser link/junction
  const rel = path.relative(root, abs);
  const chain = [root];
  let cur = root;
  for (const seg of rel.split(sep).filter(Boolean)) { cur = path.join(cur, seg); chain.push(cur); }
  let st;
  for (const c of chain) {
    try { st = await fs.promises.lstat(c); } catch (e) {
      return { ok: false, reason: e.code === 'ENOENT' || e.code === 'ENOTDIR' ? 'not-found' : 'access-denied' };
    }
    if (st.isSymbolicLink()) return { ok: false, reason: 'reparse' };
  }
  // reparse points que o lstat não marca: o caminho real tem de bater com o esperado
  try {
    const realRoot = await realNative(root);
    const realP = await realNative(abs);
    if (low(realP) !== low(path.join(realRoot, rel))) return { ok: false, reason: 'reparse' };
  } catch (e) {
    return { ok: false, reason: e.code === 'ENOENT' ? 'not-found' : 'access-denied' };
  }
  const isDir = st.isDirectory();
  if (!isDir) {
    try { (await fs.promises.open(abs, 'r')).close(); } catch (e) {
      if (inUseCode(e)) return { ok: false, reason: 'in-use' };
      if (e.code === 'ENOENT') return { ok: false, reason: 'not-found' };
      return { ok: false, reason: 'access-denied' };
    }
  }
  return { ok: true, isDir };
}

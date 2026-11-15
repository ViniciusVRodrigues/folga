import fs from 'node:fs';
import path from 'node:path';
import { toLongPath } from '../scan/walk.js';

/** Código de erro do fs -> motivo do contrato. */
export function reasonOf(e) {
  const c = e && e.code;
  if (c === 'EBUSY' || c === 'ETXTBSY') return 'in-use';
  if (c === 'ENOENT' || c === 'ENOTDIR') return 'not-found';
  if (c === 'ENAMETOOLONG') return 'too-deep';
  if (c === 'EPERM' || c === 'EACCES') return 'access-denied';
  return 'access-denied';
}

const lp = (p) => toLongPath(path.resolve(p));

async function removeLink(p) {
  try { await fs.promises.unlink(lp(p)); } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EISDIR' || e.code === 'EACCES') await fs.promises.rmdir(lp(p));
    else throw e;
  }
}

/**
 * Exclusão definitiva própria. Nunca desce em symlink/junction: remove só o link.
 * Devolve { failed: [{ path, reason }] }; continua nos outros filhos quando um falha.
 * O chamador revalida o alvo com checkPath antes.
 */
export async function removeTree(target) {
  const failed = [];
  async function visit(p) {
    let st;
    try { st = await fs.promises.lstat(lp(p)); } catch (e) {
      if (e.code === 'ENOENT') return;
      failed.push({ path: p, reason: reasonOf(e) });
      return;
    }
    try {
      if (st.isSymbolicLink()) return await removeLink(p);
      if (!st.isDirectory()) return await fs.promises.unlink(lp(p));
      const ents = await fs.promises.readdir(lp(p), { withFileTypes: true });
      let ok = true;
      for (const e of ents) {
        const n = failed.length;
        await visit(path.join(p, e.name));
        if (failed.length > n) ok = false;
      }
      if (ok) await fs.promises.rmdir(lp(p));
    } catch (e) {
      if (e.code === 'ENOENT') return;
      failed.push({ path: p, reason: reasonOf(e) });
    }
  }
  await visit(path.resolve(target));
  return { failed };
}

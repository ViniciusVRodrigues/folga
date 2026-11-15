import fs from 'node:fs';
import path from 'node:path';
import { run } from './exec.js';

/** Só estes programas rodam, e só com os argumentos fixos do catálogo. */
export const ALLOWED = new Set(['npm', 'pnpm', 'yarn', 'pip', 'uv', 'dotnet', 'go']);
const SAFE_ARG = /^[A-Za-z0-9_.-]+$/;

async function where(name, exec) {
  const out = await exec('where', [name], { timeout: 15000 });
  return out.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Executa o comando oficial de um item (`{ file, args }` do catálogo) sem shell com string do usuário.
 * npm roda por `node npm-cli.js`; outros `.cmd` por `cmd.exe /d /s /c` com argumentos fixos já validados.
 * Devolve { ok, reason?, output }.
 */
export async function runCommand(command, { exec = run, timeout = 10 * 60 * 1000 } = {}) {
  const { file, args = [] } = command || {};
  if (!ALLOWED.has(file) || !args.every((a) => SAFE_ARG.test(a))) return { ok: false, reason: 'protected' };
  let found;
  try { found = await where(file, exec); } catch { return { ok: false, reason: 'not-found' }; }
  if (!found.length) return { ok: false, reason: 'not-found' };
  const exe = found.find((f) => /\.(exe|com)$/i.test(f));
  const shim = found.find((f) => /\.(cmd|bat)$/i.test(f));
  try {
    let out;
    if (exe) {
      out = await exec(exe, args, { timeout });
    } else if (file === 'npm') {
      const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
      if (fs.existsSync(cli)) out = await exec(process.execPath, [cli, ...args], { timeout });
    }
    if (!out && shim) {
      if (/["&%^|<>]/.test(shim)) return { ok: false, reason: 'protected' };
      out = await exec(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${shim}" ${args.join(' ')}`], { timeout, windowsVerbatimArguments: true });
    }
    if (!out) return { ok: false, reason: 'not-found' };
    return { ok: true, output: out.stdout };
  } catch (e) {
    return { ok: false, reason: e.killed ? 'timeout' : 'command-failed', output: `${e.stdout || ''}${e.stderr || ''}`.slice(-2000) };
  }
}

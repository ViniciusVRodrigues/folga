import crypto from 'node:crypto';
import path from 'node:path';
import { protectedReason, locationsFor, WINDIR_ALLOWED } from './guard.js';
import { run } from './exec.js';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/** Pastas que um item de admin pode esvaziar: subpastas permitidas do Windows e o WER do ProgramData. */
function adminAllowed(p, env) {
  const L = locationsFor(env);
  const roots = [...WINDIR_ALLOWED.map((s) => path.join(L.windir, s)), path.join(L.programData, 'Microsoft', 'Windows', 'WER')];
  return roots.some((r) => path.resolve(p).toLowerCase() === path.resolve(r).toLowerCase())
    && !protectedReason(p, { env, contents: true });
}

/**
 * Monta o script PowerShell só com caminhos fixos do catálogo. `entries` = [{ id, paths }].
 * Lança se algum caminho não for uma das pastas de admin permitidas.
 */
export function buildAdminScript(entries, { env } = {}) {
  const lines = ["$ErrorActionPreference = 'Continue'", ''];
  for (const e of [...entries].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    lines.push(`# ${e.id}`);
    for (const p of e.paths) {
      if (!adminAllowed(p, env)) throw new Error(`Caminho não permitido para admin: ${p}`);
      lines.push(
        `$p = ${q(p)}`,
        'if (Test-Path -LiteralPath $p) {',
        '  Get-ChildItem -LiteralPath $p -Force -ErrorAction Continue | ForEach-Object {',
        '    if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) { $_.Delete() }',
        '    else {',
        '      Get-ChildItem -LiteralPath $_.FullName -Recurse -Force -Attributes ReparsePoint -ErrorAction SilentlyContinue | ForEach-Object { $_.Delete() }',
        '      Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Continue',
        '    }',
        '  }',
        '}',
      );
    }
    lines.push('');
  }
  const script = lines.join('\r\n');
  return { script, sha256: sha(script) };
}

export const encodeScript = (script) => Buffer.from(script, 'utf16le').toString('base64');

/** Hash do texto que o PowerShell vai decodificar (para provar que é o script exibido). */
export const hashOfEncoded = (b64) => sha(Buffer.from(b64, 'base64').toString('utf16le'));

/**
 * Executa o script com elevação por UAC. `exec` injetável. Devolve { ok, declined, encoded, sha256 }.
 * O processo do servidor nunca roda elevado: só o filho do Start-Process -Verb RunAs.
 */
export async function runElevated(script, { exec = run, timeout = 15 * 60 * 1000 } = {}) {
  const encoded = encodeScript(script);
  const sha256 = sha(script);
  const wrapper = [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    `  $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${encoded}'`,
    '  exit $p.ExitCode',
    '} catch { [Console]::Error.WriteLine($_.Exception.Message); if ($_.Exception.NativeErrorCode -eq 1223) { exit 1223 } else { exit 1 } }',
  ].join('\n');
  try {
    await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeScript(wrapper)], { timeout });
    return { ok: true, declined: false, encoded, sha256 };
  } catch (e) {
    const msg = `${e.stderr || ''}${e.stdout || ''}${e.message || ''}`;
    const declined = e.code === 1223 || /canceled by the user|cancelled by the user|cancelada pelo usu/i.test(msg);
    return { ok: false, declined, encoded, sha256, error: msg.slice(-500) };
  }
}

// Leitor rápido no Windows: compila src/scan/win/FolgaScan.cs pelo Add-Type do PowerShell 5.1,
// lê a saída dele (arquivo TSV que cresce) e monta a mesma árvore do walker em JS.
// O servidor nunca roda elevado: no modo admin, só o leitor sobe pelo UAC.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';
import { encodeScript } from '../clean/admin.js';
import { newNode, finalize, pathKey } from './walk.js';

export const READER_PATH = fileURLToPath(new URL('./win/FolgaScan.cs', import.meta.url));
const THREADS = 16;
const ERROR_CANCELLED = 1223;

/** O leitor não pôde ser iniciado (sem PowerShell, sem compilador, política): use o walker em JS. */
export class FastUnavailable extends Error {}

let cachedSha = null;
export function readerSha() {
  if (!cachedSha) cachedSha = crypto.createHash('sha256').update(fs.readFileSync(READER_PATH)).digest('hex');
  return cachedSha;
}

const psQuote = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

/**
 * Script do leitor. Lê os bytes do .cs uma vez, confere o sha256 e compila esses mesmos bytes.
 * A pasta da varredura só entra em base64.
 */
export function buildReaderScript({ csPath = READER_PATH, sha = readerSha(), root, out, cancel, pid = process.pid, largeFileMin, threads = THREADS, admin = false }) {
  const args = [b64(root), out, cancel, String(pid | 0), String(Math.max(0, Math.floor(largeFileMin))), String(threads | 0), admin ? '1' : '0'];
  return [
    "$ErrorActionPreference = 'Stop'",
    `$b = [IO.File]::ReadAllBytes(${psQuote(csPath)})`,
    "$h = -join ([Security.Cryptography.SHA256]::Create().ComputeHash($b) | ForEach-Object { $_.ToString('x2') })",
    `if ($h -ne '${sha.replace(/[^0-9a-f]/g, '')}') { exit 3 }`,
    'Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString($b))',
    `exit [FolgaScan]::Run(@(${args.map(psQuote).join(', ')}))`,
  ].join('\n');
}

/** Envolve o script do leitor num Start-Process -Verb RunAs (UAC). Recusa sai com 1223. */
export function buildElevatedWrapper(inner) {
  return [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    `  $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encodeScript(inner)}'`,
    '  exit $p.ExitCode',
    `} catch { if ($_.Exception.NativeErrorCode -eq ${ERROR_CANCELLED}) { exit ${ERROR_CANCELLED} } else { [Console]::Error.WriteLine($_.Exception.Message); exit 1 } }`,
  ].join('\n');
}

const decodeName = (s) => (s.startsWith('=') ? Buffer.from(s.slice(1), 'base64').toString('utf8') : s);

/** Monta a árvore a partir das linhas do leitor. */
export function createTreeBuilder(rootPath, { largeFileMin = 500 * 1024 ** 2 } = {}) {
  const rootNode = newNode(path.basename(rootPath) || rootPath, rootPath);
  const nodes = new Map([[0, rootNode]]);
  const order = [rootNode];
  const largeFiles = [];
  const state = { ended: null, error: null, sawDir: false, progress: { files: 0, dirs: 0, bytes: 0, unreadable: 0, current: rootPath }, unreadable: 0 };

  function line(l) {
    if (!l) return;
    const f = l.split('\t');
    switch (f[0]) {
      case 'D': {
        const id = Number(f[1]);
        const parent = Number(f[2]);
        let node;
        if (parent < 0) node = rootNode;
        else {
          const p = nodes.get(parent);
          if (!p) return;
          const name = decodeName(f.slice(8).join('\t'));
          node = newNode(name, path.join(p.path, name));
          p.children.push(node);
          nodes.set(id, node);
          order.push(node);
        }
        state.sawDir = true;
        node.mtime = Number(f[3]);
        node.noAccess = f[4] === '1';
        if (node.noAccess) state.unreadable++;
        node.directFiles = Number(f[5]);
        node.directSize = Number(f[6]);
        node.size = node.directSize;
        node.alloc = Number(f[7]);
        break;
      }
      case 'F': {
        const node = nodes.get(Number(f[1]));
        if (!node) return;
        const name = decodeName(f.slice(6).join('\t'));
        const size = Number(f[2]);
        const alloc = Number(f[3]);
        const mtime = Number(f[4]);
        const flags = Number(f[5]);
        if (flags & 1) node.topFiles.push({ name, size, alloc, mtime });
        if ((flags & 2) && size >= largeFileMin) {
          largeFiles.push({ path: path.join(node.path, name), size, mtime, ext: path.extname(name).toLowerCase() });
        }
        break;
      }
      case 'P':
        state.progress = { files: Number(f[1]), dirs: Number(f[2]), bytes: Number(f[3]), unreadable: Number(f[4]), current: decodeName(f.slice(5).join('\t')) };
        break;
      case 'E':
        state.ended = f[1];
        if (f[1] === 'error') state.error = decodeName(f.slice(2).join('\t'));
        break;
      default:
    }
  }

  return {
    line,
    state,
    result() {
      const r = finalize(rootNode, order, largeFiles);
      return { ...r, unreadable: state.unreadable };
    },
  };
}

function startPowerShell(script) {
  return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodeScript(script)], {
    windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
  });
}

const delay = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * Varre com o leitor rápido. Mesmo resultado do walker em JS, mais { backend: 'fast', admin, declined }.
 * Lança FastUnavailable se o leitor não chegou a ler nada (cabe cair no walker em JS).
 */
export async function scanFast(root, { signal, onProgress, largeFileMin = 500 * 1024 ** 2, admin = false, threads = THREADS, start = startPowerShell } = {}) {
  const t0 = Date.now();
  const rootPath = path.resolve(root);
  if (signal?.aborted) {
    const r = createTreeBuilder(rootPath, { largeFileMin }).result();
    return { ...r, elapsedMs: 0, backend: 'fast', admin, declined: false, partial: true };
  }
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'folga-scan-'));
  const out = path.join(dir, 'out.tsv');
  const cancel = path.join(dir, 'cancel');
  await fs.promises.writeFile(out, '');
  const builder = createTreeBuilder(rootPath, { largeFileMin });
  const { state } = builder;

  const inner = buildReaderScript({ root: rootPath, out, cancel, largeFileMin, threads, admin });
  const child = start(admin ? buildElevatedWrapper(inner) : inner);
  let stderr = '';
  child.stderr?.on('data', (d) => { stderr = (stderr + d).slice(-2000); });
  let exitCode = null;
  const exited = new Promise((resolve) => {
    child.on('exit', (code) => { exitCode = code ?? -1; resolve(); });
    child.on('error', (e) => { stderr += String(e?.message || e); exitCode = -1; resolve(); });
  });

  let aborted = false;
  const onAbort = () => {
    aborted = true;
    fs.promises.writeFile(cancel, '').catch(() => {});
    // sem elevação, garante o fim em menos de 1 s mesmo se o leitor ainda estiver compilando
    if (!admin) setTimeout(() => { if (exitCode === null) child.kill(); }, state.sawDir ? 600 : 0).unref?.();
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();

  let lastProgress = 0;
  const fh = await fs.promises.open(out, 'r');
  const buf = Buffer.alloc(1 << 20);
  const dec = new StringDecoder('utf8');
  let pos = 0;
  let rest = '';
  let idleAfterExit = 0;
  try {
    while (state.ended === null) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
      if (bytesRead > 0) {
        pos += bytesRead;
        const lines = (rest + dec.write(buf.subarray(0, bytesRead))).split('\n');
        rest = lines.pop();
        for (const l of lines) builder.line(l);
        const now = Date.now();
        if (onProgress && now - lastProgress >= 250) {
          lastProgress = now;
          onProgress({ ...state.progress, elapsedMs: now - t0 });
        }
        continue;
      }
      if (exitCode !== null && ++idleAfterExit > 2) break;
      await delay(exitCode !== null ? 20 : 60);
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await fh.close();
    await exited.catch(() => {});
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  if (admin && exitCode === ERROR_CANCELLED && !state.sawDir) {
    return { declined: true, admin: true, backend: 'fast', partial: true, elapsedMs: Date.now() - t0 };
  }
  if (!state.sawDir && (aborted || state.ended === 'cancel')) {
    const r = builder.result();
    return { ...r, elapsedMs: Date.now() - t0, backend: 'fast', admin, declined: false, partial: true };
  }
  if (!state.sawDir) {
    const msg = `Leitor rápido não iniciou (código ${exitCode}): ${stderr.trim().slice(-300)}`;
    if (admin) throw new Error(msg);
    throw new FastUnavailable(msg);
  }
  const r = builder.result();
  return {
    ...r, elapsedMs: Date.now() - t0, backend: 'fast', admin, declined: false,
    partial: aborted || state.ended !== 'ok',
  };
}

export { pathKey };

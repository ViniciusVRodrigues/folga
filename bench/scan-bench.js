// Mede a varredura: node bench/scan-bench.js <pasta> [limiteSegundos] [backend]
import { scanTree } from '../src/scan/walk.js';

const root = process.argv[2] || process.env.SystemDrive + '\\';
const limit = Number(process.argv[3] || 600) * 1000;
const backend = process.argv[4];
const ac = new AbortController();
const t = setTimeout(() => ac.abort(), limit);
let last = 0;
const r = await scanTree(root, {
  signal: ac.signal,
  backend,
  onProgress: (p) => {
    if (p.elapsedMs - last >= 10000) {
      last = p.elapsedMs;
      console.log(`${(p.elapsedMs / 1000).toFixed(0)}s files=${p.files} dirs=${p.dirs} GB=${(p.bytes / 1e9).toFixed(1)} sem=${p.unreadable}`);
    }
  },
});
clearTimeout(t);
const s = r.elapsedMs / 1000;
console.log(JSON.stringify({
  root, backend: r.backend, files: r.files, dirs: r.dirs, GB: +(r.bytes / 1e9).toFixed(2),
  unreadable: r.unreadable, s: +s.toFixed(1), entriesPerSec: Math.round((r.files + r.dirs) / s), partial: r.partial,
}));

import fs from 'node:fs';
import os from 'node:os';

export async function drives() {
  const sys = (process.env.SystemDrive || 'C:').toUpperCase() + '\\';
  const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
  const found = await Promise.all(letters.map(async (l) => {
    const root = `${l}:\\`;
    try {
      const s = await fs.promises.statfs(root);
      return { root, label: null, total: Number(s.bsize) * Number(s.blocks), free: Number(s.bsize) * Number(s.bavail), fs: null, system: root.toUpperCase() === sys };
    } catch {
      return null;
    }
  }));
  return found.filter(Boolean);
}

export function home() {
  return os.homedir();
}

export function shortcuts() {
  const list = [{ label: 'Home', path: home() }];
  if (fs.existsSync('C:\\GitHub')) list.push({ label: 'GitHub', path: 'C:\\GitHub' });
  return list;
}

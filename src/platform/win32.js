import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

const pick = (env, ...keys) => {
  for (const k of keys) if (env[k]) return env[k];
  return undefined;
};

/** Locais conhecidos do Windows a partir de variáveis de ambiente (injetáveis nos testes). */
export function knownLocations(env = process.env) {
  const home = pick(env, 'USERPROFILE') || os.homedir();
  const systemDrive = pick(env, 'SystemDrive') || 'C:';
  const localAppData = pick(env, 'LOCALAPPDATA') || path.join(home, 'AppData', 'Local');
  const appData = pick(env, 'APPDATA') || path.join(home, 'AppData', 'Roaming');
  const windir = pick(env, 'WINDIR', 'windir', 'SystemRoot') || systemDrive + '\\Windows';
  const programData = pick(env, 'ProgramData') || systemDrive + '\\ProgramData';
  const programFiles = pick(env, 'ProgramFiles') || systemDrive + '\\Program Files';
  const programFilesX86 = pick(env, 'ProgramFiles(x86)') || systemDrive + '\\Program Files (x86)';
  const temp = pick(env, 'TEMP', 'TMP') || path.join(localAppData, 'Temp');
  return {
    home, systemDrive, localAppData, appData, windir, programData, programFiles, programFilesX86, temp,
    downloads: path.join(home, 'Downloads'),
    recycleBin: systemDrive + '\\$Recycle.Bin',
  };
}

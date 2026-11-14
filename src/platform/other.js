import os from 'node:os';

export async function drives() {
  return [{ root: '/', label: null, total: 0, free: 0, fs: null, system: true }];
}

export function home() {
  return os.homedir();
}

export function shortcuts() {
  return [{ label: 'Home', path: home() }];
}

export function knownLocations(env = process.env) {
  const h = env.HOME || os.homedir();
  return { home: h, systemDrive: '/', localAppData: h, appData: h, windir: '', programData: '', programFiles: '', programFilesX86: '', temp: env.TMPDIR || os.tmpdir(), downloads: h + '/Downloads', recycleBin: '' };
}

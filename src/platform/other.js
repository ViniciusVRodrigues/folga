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

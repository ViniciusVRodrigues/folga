const impl = process.platform === 'win32' ? await import('./win32.js') : await import('./other.js');

export const { drives, home, shortcuts, knownLocations } = impl;

/** Parser mínimo do formato VDF/ACF da Steam (texto com chaves e aspas). */
export function parseVdf(text) {
  const tokens = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      let s = '';
      i++;
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const e = text[i + 1];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          i += 2;
        } else s += text[i++];
      }
      if (i >= n) throw new Error('VDF: aspas sem fechar');
      i++;
      tokens.push({ s });
    } else if (c === '{' || c === '}') {
      tokens.push({ b: c });
      i++;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
    } else i++;
  }
  let p = 0;
  function block() {
    const o = {};
    while (p < tokens.length) {
      const t = tokens[p];
      if (t.b === '}') { p++; return o; }
      if (t.b) throw new Error('VDF: chave inesperada');
      p++;
      const v = tokens[p];
      if (!v) throw new Error('VDF: fim inesperado');
      if (v.b === '{') { p++; o[t.s] = block(); } else if (v.b) throw new Error('VDF: chave inesperada');
      else { o[t.s] = v.s; p++; }
    }
    return o;
  }
  return block();
}

/** Caminhos das bibliotecas de um `libraryfolders.vdf`. */
export function steamLibraries(text) {
  let root;
  try { root = parseVdf(text); } catch { return []; }
  const lf = root.libraryfolders || root.LibraryFolders || {};
  const out = [];
  for (const v of Object.values(lf)) {
    if (v && typeof v === 'object' && typeof v.path === 'string' && v.path) out.push(v.path);
    else if (typeof v === 'string' && /^[A-Za-z]:\\/.test(v)) out.push(v); // formato antigo
  }
  return out;
}

/** Dados de um `appmanifest_*.acf`, ou null se inválido. */
export function parseAppManifest(text) {
  let root;
  try { root = parseVdf(text); } catch { return null; }
  const s = root.AppState;
  if (!s || !s.appid || !s.name) return null;
  return {
    appid: String(s.appid),
    name: s.name,
    installdir: s.installdir || '',
    sizeOnDisk: Number(s.SizeOnDisk) || 0,
    lastPlayed: Number(s.LastPlayed) || 0,
  };
}

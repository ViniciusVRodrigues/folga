import { run } from './exec.js';

const KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\BitBucket\\Volume\\';

/**
 * Lê a configuração da Lixeira do volume de `driveRoot` (ex.: "C:\\").
 * Devolve { nuke, maxBytes } ou null se não deu para saber.
 * Chave ausente = padrão do Windows (Lixeira ligada, sem cota conhecida).
 */
export async function binInfo(driveRoot, exec = run) {
  let guid;
  try {
    const out = await exec('mountvol', [driveRoot.slice(0, 2) + '\\', '/L']);
    guid = /Volume(\{[0-9a-f-]{36}\})/i.exec(out.stdout)?.[1];
  } catch { return null; }
  if (!guid) return null;
  let text;
  try {
    text = (await exec('reg', ['query', KEY + guid])).stdout;
  } catch (e) {
    if (e.code === 1) return { nuke: false, maxBytes: null };
    return null;
  }
  const num = (name) => {
    const m = new RegExp(`${name}\\s+REG_DWORD\\s+0x([0-9a-f]+)`, 'i').exec(text);
    return m ? parseInt(m[1], 16) : null;
  };
  const nuke = num('NukeOnDelete') === 1;
  const maxMb = num('MaxCapacity');
  return { nuke, maxBytes: maxMb ? maxMb * 1024 * 1024 : null };
}

/** O Windows apagaria de vez um item deste tamanho? */
export function wouldBePermanent(info, size) {
  if (!info) return false;
  return info.nuke || (info.maxBytes != null && size > info.maxBytes);
}

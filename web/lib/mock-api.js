// API de mentira para desenvolver e testar a UI sem o servidor (?mock=1).
// Fixtures tiradas do raio-x real do PC: C: com 953 GB e 16 GB livres.
import { ApiError } from './api.js';

export const MB = 1024 ** 2;
export const GB = 1024 ** 3;
const DAY = 86400000;

function hash12(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0') + 'a1b2'.slice(0, 4);
}

const HOME = 'C:\\Users\\vinic';

function item(id, name, size, o = {}) {
  return {
    id, name,
    whatItIs: o.what || 'Arquivos que o programa guarda para abrir mais rápido.',
    afterCleaning: o.after || 'O programa recria o que precisar, na próxima vez que abrir.',
    size, risk: o.risk || 'low', action: o.action || 'clean',
    needsAdmin: (o.action || 'clean') === 'admin',
    preselect: false,
    paths: o.paths || [],
    lastUsed: o.lastUsed || null,
    permanent: o.permanent === true,
    regenerable: o.regenerable === true,
    inUseBy: o.inUseBy || [],
    guide: o.guide || null,
    unreadable: false,
    ...(o.project ? { project: o.project } : {}),
    ...(o.game ? { game: o.game } : {}),
  };
}

export function buildCleanup(now = Date.now()) {
  const ago = (d) => new Date(now - d * DAY).toISOString();
  const proj = (name, days) => ({ root: 'C:\\GitHub\\' + name, name, lastTouched: ago(days) });
  const nm = (name, size, days) => {
    const p = 'C:\\GitHub\\' + name + '\\node_modules';
    return item('dev.node_modules:' + hash12(p), 'node_modules', size, {
      what: 'Pacotes baixados do npm para o projeto ' + name + '.',
      after: 'Rode npm install quando for mexer no projeto de novo.',
      paths: [p], regenerable: true, project: proj(name, days),
    });
  };
  const game = (appid, name, size, played, lib) => {
    const p = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\' + name;
    return item('games.steam:' + hash12(p), name, size, {
      what: 'Jogo instalado pela Steam.',
      after: 'O jogo sai do disco; seus saves na nuvem da Steam continuam. Dá para baixar de novo.',
      risk: 'medium', action: 'guided', paths: [p],
      game: { appid, library: lib, lastPlayed: played ? ago(played) : null },
      guide: {
        steps: ['Abra a Steam e vá em Biblioteca.', 'Clique com o botão direito no jogo.', 'Escolha Gerenciar e depois Desinstalar.'],
        open: { kind: 'steam', target: 'steam://uninstall/' + appid },
      },
    });
  };
  const dl = (file, size, days) => {
    const p = HOME + '\\Downloads\\' + file;
    return item('downloads.installer:' + hash12(p), file, size, {
      what: 'Instalador que você baixou há ' + days + ' dias.',
      after: 'Se precisar instalar de novo, é preciso baixar outra vez.',
      risk: 'medium', paths: [p], lastUsed: ago(days),
    });
  };
  const cats = [
    { id: 'system', name: 'Sistema', items: [
      item('system.user-temp', 'Arquivos temporários (sua conta)', 7 * GB, { what: 'Arquivos que programas deixam em Temp enquanto trabalham.', after: 'Os programas criam de novo o que precisarem.', paths: [HOME + '\\AppData\\Local\\Temp'], regenerable: true, inUseBy: ['Teams.exe'] }),
      item('system.thumbcache', 'Miniaturas de imagens', 180 * MB, { what: 'Prévias de fotos e vídeos que o Explorer guarda.', paths: [HOME + '\\AppData\\Local\\Microsoft\\Windows\\Explorer'] }),
      item('system.wer-user', 'Relatórios de erro (sua conta)', 45 * MB, { what: 'Relatórios de travamento que o Windows guardou.', after: 'Nada muda; só some o histórico de erros.', paths: [HOME + '\\AppData\\Local\\Microsoft\\Windows\\WER'] }),
      item('system.crashdumps', 'Despejos de falha de aplicativos', 320 * MB, { what: 'Cópias da memória de programas que travaram.', after: 'Nada muda, a não ser que você analise o travamento.', paths: [HOME + '\\AppData\\Local\\CrashDumps'], regenerable: true }),
      item('system.windows-temp', 'Temporários do Windows', 1.1 * GB, { action: 'admin', permanent: true, what: 'Temporários de todo o sistema, em C:\\Windows\\Temp.', paths: ['C:\\Windows\\Temp'] }),
      item('system.wu-download', 'Cache do Windows Update', 4.2 * GB, { action: 'admin', permanent: true, what: 'Atualizações já instaladas que o Windows ainda guarda.', after: 'O Windows baixa de novo só o que precisar.', paths: ['C:\\Windows\\SoftwareDistribution\\Download'] }),
      item('system.windows-logs', 'Logs do Windows', 600 * MB, { action: 'admin', risk: 'medium', permanent: true, what: 'Registros de instalação e de serviços do Windows.', after: 'Você perde o histórico usado para diagnosticar problemas.', paths: ['C:\\Windows\\Logs'] }),
      item('system.recycle-bin', 'Lixeira', 3.4 * GB, { action: 'guided', risk: 'medium', what: 'Tudo o que você apagou e ainda dá para recuperar.', after: 'Os arquivos somem de vez, sem volta.', guide: { steps: ['Clique em Esvaziar Lixeira.', 'Confirme. A limpeza roda sem pedir permissão de administrador.'], copy: 'Clear-RecycleBin -Force' } }),
      item('system.winsxs', 'Componentes do Windows (WinSxS)', 9.8 * GB, { action: 'guided', risk: 'medium', what: 'Versões antigas de componentes do sistema.', after: 'O Windows limpa só o que é seguro; leva alguns minutos.', guide: { steps: ['Abra o Prompt de Comando como administrador.', 'Cole o comando e aguarde terminar.'], copy: 'DISM.exe /Online /Cleanup-Image /StartComponentCleanup' } }),
    ] },
    { id: 'graphics', name: 'Gráficos', items: [
      item('graphics.nvidia-dxcache', 'NVIDIA: cache de shaders (DXCache)', 1.4 * GB, { what: 'Shaders de jogos já compilados pela placa NVIDIA.', after: 'Os jogos recompilam e podem travar um pouco na primeira vez.', paths: [HOME + '\\AppData\\Local\\NVIDIA\\DXCache'], regenerable: true }),
      item('graphics.nvidia-glcache', 'NVIDIA: cache OpenGL (GLCache)', 220 * MB, { what: 'Shaders OpenGL compilados pela placa NVIDIA.', paths: [HOME + '\\AppData\\Local\\NVIDIA\\GLCache'], regenerable: true }),
      item('graphics.d3dscache', 'DirectX: cache de shaders', 480 * MB, { what: 'Shaders do DirectX guardados pelo Windows.', paths: [HOME + '\\AppData\\Local\\D3DSCache'], regenerable: true }),
      item('graphics.steam-shadercache', 'Steam: cache de shaders', 2.6 * GB, { what: 'Shaders compilados para os jogos da Steam.', after: 'A Steam recompila na próxima vez que você jogar.', paths: ['C:\\Program Files (x86)\\Steam\\steamapps\\shadercache'], regenerable: true }),
    ] },
    { id: 'browsers', name: 'Navegadores', items: [
      item('browsers.chrome-cache', 'Chrome: cache de páginas', 1.9 * GB, { what: 'Cópias de imagens e arquivos de sites que você visitou.', after: 'Os sites carregam um pouco mais devagar na primeira visita. Você continua logado.', paths: [HOME + '\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache'], regenerable: true, inUseBy: ['chrome.exe'] }),
      item('browsers.chrome-code-cache', 'Chrome: cache de código', 310 * MB, { what: 'Código de sites já compilado pelo Chrome.', paths: [HOME + '\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Code Cache'], regenerable: true, inUseBy: ['chrome.exe'] }),
      item('browsers.edge-cache', 'Edge: cache de páginas', 640 * MB, { what: 'Cópias de imagens e arquivos de sites visitados no Edge.', paths: [HOME + '\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache'], regenerable: true }),
      item('browsers.chrome-sw', 'Chrome: dados de Service Workers', 520 * MB, { risk: 'medium', what: 'Dados que alguns sites guardam para funcionar offline.', after: 'Sites que funcionam offline podem pedir para baixar tudo de novo.', paths: [HOME + '\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Service Worker'] }),
    ] },
    { id: 'apps', name: 'Aplicativos', items: [
      item('apps.discord-cache', 'Discord: cache', 410 * MB, { what: 'Imagens e anexos que o Discord guardou.', paths: [HOME + '\\AppData\\Roaming\\discord\\Cache'], regenerable: true }),
      item('apps.spotify-cache', 'Spotify: músicas em cache', 900 * MB, { what: 'Músicas que o Spotify baixou para tocar mais rápido.', after: 'O Spotify baixa de novo quando você tocar.', paths: [HOME + '\\AppData\\Local\\Spotify\\Storage'], regenerable: true }),
      item('apps.vscode-workspace', 'VS Code: dados de workspaces', 1.2 * GB, { risk: 'medium', what: 'Estado salvo de cada pasta que você abriu no VS Code.', after: 'Você perde abas abertas e histórico local de alguns projetos.', paths: [HOME + '\\AppData\\Roaming\\Code\\User\\workspaceStorage'] }),
    ] },
    { id: 'dev', name: 'Desenvolvimento', items: [
      nm('ermo', 1.1 * GB, 12), nm('uai', 930 * MB, 40), nm('folga', 310 * MB, 2), nm('loja-teste', 640 * MB, 260), nm('blog-antigo', 480 * MB, 410),
      item('dev.next:' + hash12('ermo-next'), '.next', 350 * MB, { what: 'Build do Next.js do projeto ermo.', after: 'Rode npm run build ou o servidor de desenvolvimento para recriar.', paths: ['C:\\GitHub\\ermo\\.next'], regenerable: true, project: proj('ermo', 12) }),
      item('dev.npm-cache', 'Cache do npm', 2.1 * GB, { what: 'Pacotes que o npm já baixou.', after: 'O próximo npm install baixa de novo o que precisar.', paths: [HOME + '\\AppData\\Local\\npm-cache'], regenerable: true }),
      item('dev.gradle-caches', 'Cache do Gradle', 1.3 * GB, { what: 'Dependências e builds guardados pelo Gradle.', paths: [HOME + '\\.gradle\\caches'], regenerable: true }),
      item('dev.cargo-registry', 'Cache do Cargo (Rust)', 2.4 * GB, { risk: 'medium', what: 'Código-fonte de bibliotecas Rust já baixadas.', after: 'O Cargo baixa de novo, mas precisa de internet.', paths: [HOME + '\\.cargo\\registry'] }),
      item('dev.dump:' + hash12('hprof'), 'java_pid4128.hprof', 2.2 * GB, { what: 'Despejo de memória de um programa Java.', after: 'Nada muda, a menos que você ainda vá analisá-lo.', paths: [HOME + '\\Documents\\java_pid4128.hprof'] }),
      item('dev.model:' + hash12('gguf'), 'llama-3-8b.Q4.gguf', 4.7 * GB, { risk: 'medium', what: 'Modelo de IA para rodar no seu PC.', after: 'Para usar de novo, é preciso baixar o modelo.', paths: [HOME + '\\models\\llama-3-8b.Q4.gguf'] }),
      item('dev.docker-vhdx', 'Disco virtual do Docker (WSL)', 73 * GB, { action: 'guided', risk: 'medium', what: 'Imagens, contêineres e volumes do Docker Desktop.', after: 'Contêineres e volumes apagados não voltam. O disco só encolhe depois de compactar.', paths: [HOME + '\\AppData\\Local\\Docker\\wsl\\disk\\docker_data.vhdx'], guide: { steps: ['Rode docker system prune para remover o que não está em uso.', 'Feche o Docker Desktop e rode wsl --shutdown.', 'Compacte o arquivo vhdx com o Optimize-VHD ou o diskpart.'], copy: 'docker system prune' } }),
    ] },
    { id: 'games', name: 'Jogos', items: [
      game(1174180, 'Red Dead Redemption 2', 113 * GB, 90, 'C:\\Program Files (x86)\\Steam'),
      game(1091500, 'Cyberpunk 2077', 72 * GB, 300, 'C:\\Program Files (x86)\\Steam'),
      game(1245620, 'Elden Ring', 70 * GB, null, 'C:\\Program Files (x86)\\Steam'),
      game(367520, 'Hollow Knight', 9 * GB, 20, 'C:\\Program Files (x86)\\Steam'),
      game(413150, 'Stardew Valley', 1 * GB, 4, 'C:\\Program Files (x86)\\Steam'),
    ] },
    { id: 'downloads', name: 'Downloads', items: [
      dl('Windows11_23H2.iso', 5.6 * GB, 140), dl('OBS-Studio-30.1-Installer.exe', 120 * MB, 95), dl('setup-vscode-x64.exe', 98 * MB, 61),
    ] },
  ];
  for (const c of cats) for (const it of c.items) it.preselect = it.risk === 'low' && it.action === 'clean' && c.id !== 'downloads';
  return cats;
}

// ----- árvore da varredura -----
const dd = (name, children, extra = {}) => ({ name, type: 'dir', children, ...extra });
const dz = (name, size, extra = {}) => ({ name, type: 'dir', size, items: 800, children: null, ...extra });
const ff = (name, size, age = 30) => ({ name, type: 'file', size, age });

function buildTreeC() {
  const docs = [];
  for (let i = 0; i < 260; i++) docs.push(ff('nota-' + String(i).padStart(3, '0') + '.txt', (20 + (i % 37) * 3) * 1024, i));
  docs.push(dz('Projetos', 12 * GB), ff('java_pid4128.hprof', 2.2 * GB, 40));
  return dd('C:\\', [
    dd('Users', [dd('vinic', [
      dd('AppData', [
        dd('Local', [dz('Docker', 73 * GB), dz('Temp', 7 * GB), dz('Google', 4.1 * GB), dz('Programs', 12 * GB), dz('Packages', 9 * GB), dz('Microsoft', 11 * GB), dz('npm-cache', 2.1 * GB), dz('NVIDIA', 1.6 * GB)]),
        dz('Roaming', 6.4 * GB), dz('LocalLow', 0.3 * GB),
      ]),
      dd('Documents', docs), dz('Downloads', 9.4 * GB), dz('Videos', 41 * GB), dz('Pictures', 18 * GB), dz('Desktop', 2 * GB),
      dz('.gradle', 1.3 * GB), dz('.nuget', 1.8 * GB), dz('.cargo', 2.4 * GB), dz('OneDrive', 15 * GB),
    ])]),
    dd('Windows', [dz('WinSxS', 9.8 * GB), dz('System32', 11 * GB), dz('Installer', 7.5 * GB), dz('SoftwareDistribution', 4.2 * GB), dz('Temp', 1.1 * GB), dz('Fonts', 0.4 * GB), dz('CSC', 0, { noAccess: true })]),
    dd('Program Files', [dz('Adobe', 24 * GB), dz('Microsoft Office', 4.1 * GB), dz('NVIDIA Corporation', 3.5 * GB), dz('Docker', 3.3 * GB), dz('Google', 0.7 * GB)]),
    dd('Program Files (x86)', [dd('Steam', [dd('steamapps', [dd('common', [
      dz('Red Dead Redemption 2', 113 * GB), dz('Cyberpunk 2077', 72 * GB), dz('Elden Ring', 70 * GB), dz('Hollow Knight', 9 * GB), dz('Stardew Valley', 1 * GB)]),
      dz('shadercache', 2.6 * GB)])]), dz('Microsoft', 2.2 * GB)]),
    dd('GitHub', [dz('ermo', 4.1 * GB), dz('uai', 3.2 * GB), dz('folga', 0.4 * GB), dz('loja-teste', 1.1 * GB), dz('blog-antigo', 0.9 * GB)]),
    dz('Epic Games', 130 * GB), dz('Backups', 91 * GB), dz('ProgramData', 8 * GB),
    ff('pagefile.sys', 16 * GB, 3), ff('hiberfil.sys', 12 * GB, 3), ff('swapfile.sys', 0.25 * GB, 3),
    dz('System Volume Information', 0, { noAccess: true }), dz('$Recycle.Bin', 0, { noAccess: true }),
  ]);
}

function buildTreeD() {
  return dd('D:\\', [dz('Games', 210 * GB), dz('Videos', 160 * GB), dd('Fotos', [dz('2023', 40 * GB), dz('2024', 62 * GB)]), ff('backup-2022.zip', 9 * GB, 700)]);
}

function finalize(node, parentPath, now, i = 0) {
  node.path = parentPath === null ? node.name : parentPath.replace(/\\$/, '') + '\\' + node.name;
  node.mtime = new Date(now - ((i * 37) % 400 + 1) * DAY).toISOString();
  if (node.children) {
    let size = 0, items = 0;
    node.children.forEach((c, n) => { finalize(c, node.path, now, n + 1); size += c.size; items += c.type === 'dir' ? c.items : 1; });
    node.size = size; node.items = items;
  } else if (node.type === 'file') node.items = 1;
  node.alloc = node.size;
  return node;
}

function findNode(root, path) {
  if (!root) return null;
  const norm = (p) => p.replace(/[\\/]+$/, '').toLowerCase();
  const target = norm(path);
  const walk = (n) => {
    if (norm(n.path) === target) return n;
    if (!n.children || !target.startsWith(norm(n.path))) return null;
    for (const c of n.children) { const r = walk(c); if (r) return r; }
    return null;
  };
  return walk(root);
}

function parentOf(path) {
  const m = path.replace(/[\\/]+$/, '');
  const i = m.lastIndexOf('\\');
  if (i < 0) return null;
  return i === 2 && /^[A-Za-z]:/.test(m) ? m.slice(0, 3) : m.slice(0, i);
}

export function createMockApi({ delay = 120, adminDeclined = false } = {}) {
  const now = Date.now();
  const roots = { 'c:': finalize(buildTreeC(), null, now), 'd:': finalize(buildTreeD(), null, now) };
  let cleanup = buildCleanup(now);
  let freeC = 16 * GB;
  let binSize = 3.4 * GB;
  let scanRoot = null, scanRootPath = null, scanPartial = false, scanTimer = null, scanCount = 0, scanState = null, scanAdmin = false;
  let measuring = false, measured = false;
  const retried = new Set();
  const jobs = new Map();
  let jobCount = 0;
  const listeners = new Set();
  const wait = (v) => new Promise((r) => setTimeout(() => r(v), delay));
  const emit = (name, data) => listeners.forEach((fn) => fn(name, data));

  const visible = () => cleanup.map((c) => ({ ...c, items: c.items.filter((i) => (i.id === 'system.recycle-bin' ? binSize : i.size) > 0) })).filter((c) => c.items.length);
  const drives = () => [
    { root: 'C:\\', label: 'Windows', total: 953 * GB, free: freeC, fs: 'NTFS', system: true },
    { root: 'D:\\', label: 'Dados', total: 931 * GB, free: 412 * GB, fs: 'NTFS', system: false },
  ];

  function endScan(partial) {
    clearInterval(scanTimer); scanTimer = null;
    scanPartial = partial; scanRoot = scanState.node; scanAdmin = scanState.admin;
    emit('scan-done', { scanId: scanState.id, partial, files: scanState.files, dirs: scanState.dirs, bytes: scanState.bytes, unreadable: scanAdmin ? 0 : 12, elapsedMs: scanState.ticks * 250, admin: scanAdmin });
    scanState = null;
  }

  return {
    mock: true,
    async drives() {
      return wait({ drives: drives(), home: HOME, shortcuts: [
        { label: 'Home', path: HOME }, { label: 'Downloads', path: HOME + '\\Downloads' },
        { label: 'Documentos', path: HOME + '\\Documents' }, { label: 'GitHub', path: 'C:\\GitHub' }] });
    },
    // no mock, ?uac=nao simula a recusa do UAC
    async scan(path, { admin = false } = {}) {
      if (scanTimer) throw new ApiError('SCAN_RUNNING', 'Já existe uma varredura em andamento.', 409);
      const root = roots[String(path).slice(0, 2).toLowerCase()];
      const node = findNode(root, path);
      if (!node || node.type !== 'dir') throw new ApiError('BAD_REQUEST', 'A pasta não existe.', 400);
      const id = 's' + ++scanCount;
      if (admin && /[?&]uac=nao/.test(location.search)) {
        setTimeout(() => emit('scan-done', { scanId: id, declined: true, admin: true, partial: !!scanPartial }), 1200);
        return wait({ scanId: id });
      }
      scanRootPath = node.path;
      scanState = { id, node, files: 0, dirs: 0, bytes: 0, ticks: 0, admin };
      const total = node.size, totalFiles = Math.round(node.items * 40);
      scanTimer = setInterval(() => {
        const s = scanState; s.ticks++;
        const f = Math.min(1, s.ticks / 10);
        s.files = Math.round(totalFiles * f); s.dirs = Math.round(totalFiles * f / 9); s.bytes = Math.round(total * f);
        emit('scan-progress', { scanId: id, files: s.files, dirs: s.dirs, bytes: s.bytes, current: node.path + '\\...\\' + ['Cache', 'node_modules', 'Packages', 'Temp'][s.ticks % 4], unreadable: f > 0.4 && !admin ? 12 : 0, elapsedMs: s.ticks * 250 });
        if (s.ticks >= 10) endScan(false);
      }, 250);
      return wait({ scanId: id });
    },
    async scanStatus() {
      if (scanTimer) return wait({ state: 'running', root: scanRootPath, progress: null, partial: false, admin: scanState.admin, canElevate: true });
      if (scanRoot) return wait({ state: 'done', root: scanRootPath, progress: null, partial: scanPartial, admin: scanAdmin, canElevate: true });
      return wait({ state: 'idle', root: null, progress: null, partial: false, admin: false, canElevate: true });
    },
    async cleanupStatus() { return wait({ running: measuring, progress: null, generatedAt: null, error: null }); },
    async cancelScan() { if (scanTimer) endScan(true); return { ok: true }; },
    async tree(path, limit = 200) {
      if (!scanRoot) throw new ApiError('NO_SCAN', 'Faça uma varredura primeiro.', 409);
      const node = findNode(scanRoot, path);
      if (!node) throw new ApiError('NOT_FOUND', 'Pasta fora da varredura.', 404);
      const kids = (node.children || []).slice().sort((a, b) => b.size - a.size);
      const shown = kids.slice(0, limit), rest = kids.slice(limit);
      const res = {
        path: node.path, name: node.name, size: node.size, alloc: node.size, files: node.items, dirs: 0,
        noAccess: !!node.noAccess, partial: scanPartial,
        parent: node.path === scanRootPath ? null : parentOf(node.path),
        children: shown.map((c) => ({ name: c.name, path: c.path, type: c.type, size: c.size, alloc: c.size, items: c.items, noAccess: !!c.noAccess, mtime: c.mtime })),
      };
      if (rest.length) res.more = { count: rest.length, size: rest.reduce((s, c) => s + c.size, 0) };
      return wait(res);
    },
    async largeFiles(min = 524288000) {
      if (!scanRoot) throw new ApiError('NO_SCAN', 'Faça uma varredura primeiro.', 409);
      const files = [
        ['C:\\Users\\vinic\\AppData\\Local\\Docker\\wsl\\disk\\docker_data.vhdx', 73 * GB, 'vhdx', 1],
        ['C:\\pagefile.sys', 16 * GB, 'sys', 3], ['C:\\hiberfil.sys', 12 * GB, 'sys', 3],
        ['C:\\Program Files (x86)\\Steam\\steamapps\\common\\Red Dead Redemption 2\\x64\\data\\data0.rpf', 6.1 * GB, 'rpf', 90],
        ['C:\\Users\\vinic\\Downloads\\Windows11_23H2.iso', 5.6 * GB, 'iso', 140],
        ['C:\\Users\\vinic\\models\\llama-3-8b.Q4.gguf', 4.7 * GB, 'gguf', 30],
        ['C:\\Users\\vinic\\Documents\\java_pid4128.hprof', 2.2 * GB, 'hprof', 40],
        ['C:\\Users\\vinic\\Videos\\viagem-2023.mp4', 1.8 * GB, 'mp4', 330], ['C:\\Backups\\fotos.zip', 0.9 * GB, 'zip', 500],
        ['C:\\Users\\vinic\\Videos\\tutorial.mkv', 0.6 * GB, 'mkv', 60],
      ].filter((f) => f[1] >= min).map(([path, size, ext, age]) => ({ path, size, ext, mtime: new Date(now - age * DAY).toISOString() }));
      return wait({ files });
    },
    // Igual ao servidor real: 202 na hora; progresso por evento; GET só depois de medir (antes: 409 NO_SCAN).
    async cleanupRefresh() {
      if (measuring) return wait({});
      measuring = true;
      const total = 14;
      for (let i = 1; i <= total; i++) setTimeout(() => emit('cleanup-progress', { category: 'dev', done: i, total }), i * 120);
      setTimeout(() => { measuring = false; measured = true; emit('cleanup-done', { ok: true }); }, total * 120 + 100);
      return wait({});
    },
    async cleanup() {
      if (!measured) throw new ApiError('NO_SCAN', 'O catálogo ainda não foi medido. Chame POST /api/cleanup/refresh.', 409);
      const cats = visible();
      let safeNow = 0, needsDecision = 0;
      const out = cats.map((c) => {
        const counts = { safe: 0, admin: 0, decision: 0 };
        let size = 0;
        for (const i of c.items) {
          size += i.size;
          if (i.risk === 'low' && i.action === 'clean' && !i.needsAdmin) { counts.safe++; safeNow += i.size; }
          else { needsDecision += i.size; if (i.needsAdmin) counts.admin++; else counts.decision++; }
        }
        return { id: c.id, name: c.name, size, counts, scanning: false, items: c.items.map((i) => ({ ...i, size: i.id === 'system.recycle-bin' ? binSize : i.size })) };
      });
      return wait({
        generatedAt: new Date().toISOString(), drive: { root: 'C:\\', total: 953 * GB, free: freeC },
        summary: { safeNow, needsDecision },
        checked: ['NVIDIA', 'AMD', 'Steam', 'Chrome', 'Edge', 'Docker', 'Discord', 'VS Code', 'npm'],
        categories: out.map((c) => ({ ...c, scanning: measuring })),
      });
    },
    async open(itemId, kind) {
      const ok = cleanup.some((c) => c.items.some((i) => i.id === itemId));
      if (!ok) throw new ApiError('NOT_FOUND', 'Item desconhecido.', 404);
      return wait({ ok: true, kind });
    },
    async adminScript(ids) {
      const items = cleanup.flatMap((c) => c.items).filter((i) => ids.includes(i.id) && i.needsAdmin);
      const script = '$ErrorActionPreference = \'Continue\'\n' + items.map((i) => `Get-ChildItem -LiteralPath '${i.paths[0]}' -Force | Remove-Item -Recurse -Force  # ${i.id}`).join('\n') + '\n';
      return wait({ script, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' });
    },
    async clean(items) {
      const all = new Map(cleanup.flatMap((c) => c.items.map((i) => [i.id, i])));
      const stale = items.filter((x) => !all.has(x.id)).map((x) => x.id);
      if (stale.length) throw new ApiError('STALE_ITEM', 'Itens desatualizados: ' + stale.join(', '), 409);
      for (const x of items) {
        const it = all.get(x.id);
        if (it.action === 'guided') throw new ApiError('BAD_REQUEST', 'Item guiado não é apagado aqui.', 400);
        if (x.mode === 'delete' && !it.regenerable) throw new ApiError('BAD_REQUEST', 'Este item só pode ir para a Lixeira.', 400);
      }
      const jobId = 'j' + ++jobCount;
      const plan = items.map((x) => { const it = all.get(x.id); return { itemId: x.id, size: it.size, permanent: it.permanent || x.mode === 'delete', needsAdmin: it.needsAdmin }; });
      const job = { jobId, status: 'running', freed: 0, movedToBin: 0, deletedPermanently: 0, items: [], drive: { root: 'C:\\', free: freeC } };
      jobs.set(jobId, job);
      const normal = items.filter((x) => !all.get(x.id).needsAdmin), admin = items.filter((x) => all.get(x.id).needsAdmin);
      let t = 300;
      const finish = (x, status, reason) => {
        const it = all.get(x.id);
        const freed = status === 'done' ? it.size : 0;
        job.items.push({ itemId: x.id, status, freed, reason: reason || null });
        if (status === 'done') {
          job.freed += freed; freeC += freed; it.size = 0; retried.delete(x.id);
          if (it.permanent || x.mode === 'delete') job.deletedPermanently += freed; else { job.movedToBin += freed; binSize += freed; }
        }
        job.drive = { root: 'C:\\', free: freeC };
        emit('clean-progress', { jobId, itemId: x.id, status, ...(reason ? { reason } : {}) });
      };
      for (const x of normal) {
        const it = all.get(x.id);
        setTimeout(() => emit('clean-progress', { jobId, itemId: x.id, status: 'running' }), t);
        t += 700;
        setTimeout(() => {
          if (it.inUseBy.length && it.id === 'browsers.chrome-cache' && !retried.has(x.id)) { retried.add(x.id); finish(x, 'failed', 'in-use'); }
          else finish(x, 'done');
        }, t);
      }
      if (admin.length) {
        admin.forEach((x) => setTimeout(() => emit('clean-progress', { jobId, itemId: x.id, status: 'running' }), t));
        t += 2200;
        setTimeout(() => admin.forEach((x) => (adminDeclined ? finish(x, 'skipped', 'admin-declined') : finish(x, 'done'))), t);
      }
      setTimeout(() => { job.status = 'done'; emit('clean-done', { jobId }); }, t + 200);
      return wait({ jobId, plan });
    },
    async job(jobId) {
      const j = jobs.get(jobId);
      if (!j) throw new ApiError('NOT_FOUND', 'Trabalho desconhecido.', 404);
      return wait(JSON.parse(JSON.stringify(j)));
    },
    async emptyBin() {
      const freed = binSize; binSize = 0; freeC += freed;
      return wait({ freed });
    },
    events(handler) { listeners.add(handler); return () => listeners.delete(handler); },
  };
}

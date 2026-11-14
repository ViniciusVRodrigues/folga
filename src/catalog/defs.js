import path from 'node:path';
import { listDirs, listFiles } from './util.js';

const j = path.join;

/** Categorias, na ordem de exibição. */
export const CATEGORIES = [
  { id: 'system', name: 'Sistema' },
  { id: 'graphics', name: 'Gráficos' },
  { id: 'browsers', name: 'Navegadores' },
  { id: 'apps', name: 'Aplicativos' },
  { id: 'dev', name: 'Desenvolvimento' },
  { id: 'games', name: 'Jogos' },
  { id: 'downloads', name: 'Downloads' },
];

const CACHE_AFTER = 'O programa recria o cache sozinho. Na primeira vez pode abrir um pouco mais devagar.';

/** Itens fixos (caminhos conhecidos). `paths(L)` recebe os locais de `knownLocations`. */
export const STATIC_DEFS = [
  // ---- Sistema (sem admin)
  {
    id: 'system.user-temp', category: 'system', group: 'Temp', name: 'Arquivos temporários (sua conta)',
    whatItIs: 'Sobras que programas deixam na pasta Temp enquanto trabalham.',
    afterCleaning: 'Nada muda. Arquivos em uso são pulados e o Windows recria o que precisar.',
    risk: 'low', action: 'clean', method: 'trash-contents', regenerable: true, preselect: true,
    paths: (L) => [L.temp],
  },
  {
    id: 'system.wer-user', category: 'system', group: 'Windows', name: 'Relatórios de erro (sua conta)',
    whatItIs: 'Relatórios que o Windows guarda quando um programa trava.',
    afterCleaning: 'Nada muda no uso. Você só perde o histórico desses erros.',
    risk: 'low', action: 'clean', method: 'trash-contents', regenerable: true, preselect: true,
    paths: (L) => [j(L.localAppData, 'Microsoft', 'Windows', 'WER')],
  },
  {
    id: 'system.crashdumps', category: 'system', group: 'Windows', name: 'Dumps de travamento (CrashDumps)',
    whatItIs: 'Cópias da memória de programas que travaram, usadas para achar o erro.',
    afterCleaning: 'Nada muda no uso. Só some o registro dos travamentos antigos.',
    risk: 'low', action: 'clean', method: 'trash-contents', regenerable: true, preselect: true,
    paths: (L) => [j(L.localAppData, 'CrashDumps')],
  },
  {
    id: 'system.thumbcache', category: 'system', group: 'Windows', name: 'Miniaturas de imagens (thumbcache)',
    whatItIs: 'Prévias pequenas das suas imagens e vídeos, para o Explorer abrir pastas mais rápido.',
    afterCleaning: 'O Windows refaz as miniaturas quando você abrir as pastas.',
    risk: 'low', action: 'clean', method: 'trash', regenerable: true, preselect: true,
    paths: (L) => listFiles(j(L.localAppData, 'Microsoft', 'Windows', 'Explorer'), /^thumbcache_.*\.db$/i),
    roots: (L) => [j(L.localAppData, 'Microsoft', 'Windows', 'Explorer')],
  },
  {
    id: 'system.recycle-bin', category: 'system', group: 'Lixeira', name: 'Lixeira',
    whatItIs: 'Arquivos que você já apagou e que ainda podem ser restaurados.',
    afterCleaning: 'Esses arquivos deixam de poder ser restaurados.',
    risk: 'medium', action: 'guided', method: null, regenerable: false, preselect: false,
    paths: (L) => [L.recycleBin],
    guide: { steps: ['Use "Esvaziar Lixeira…" do app. Ele pede uma confirmação própria.', 'Confira na Lixeira se não há nada que você queira de volta.'], open: { kind: 'explorer', target: 'shell:RecycleBinFolder' } },
  },
  {
    id: 'system.winsxs', category: 'system', group: 'Windows', budgetMs: 15000, name: 'Componentes do Windows (WinSxS)',
    whatItIs: 'Pasta do sistema com versões de componentes do Windows e das atualizações. Não se apaga à mão.',
    afterCleaning: 'A limpeza oficial remove só versões antigas e não desinstala atualizações.',
    risk: 'high', action: 'guided', method: null, regenerable: false, preselect: false,
    paths: (L) => [j(L.windir, 'WinSxS')],
    guide: { steps: ['Abra o Prompt de Comando como administrador.', 'Rode o comando abaixo e espere terminar.'], copy: 'Dism /Online /Cleanup-Image /StartComponentCleanup' },
  },
  // ---- Sistema (admin)
  {
    id: 'system.windows-temp', category: 'system', group: 'Windows', name: 'Temp do Windows',
    whatItIs: 'Arquivos temporários do próprio sistema, usados na instalação de programas e atualizações.',
    afterCleaning: 'Nada muda. O Windows recria o que precisar. Pede permissão de administrador.',
    risk: 'low', action: 'admin', method: 'admin-contents', regenerable: true, preselect: false,
    paths: (L) => [j(L.windir, 'Temp')],
  },
  {
    id: 'system.windows-update', category: 'system', group: 'Windows', name: 'Downloads do Windows Update',
    whatItIs: 'Atualizações do Windows já baixadas e guardadas antes de instalar.',
    afterCleaning: 'Se faltar algo, o Windows Update baixa de novo. Pede permissão de administrador.',
    risk: 'low', action: 'admin', method: 'admin-contents', regenerable: true, preselect: false,
    paths: (L) => [j(L.windir, 'SoftwareDistribution', 'Download')],
  },
  {
    id: 'system.prefetch', category: 'system', group: 'Windows', name: 'Prefetch',
    whatItIs: 'Lista que o Windows usa para abrir programas mais rápido.',
    afterCleaning: 'Os programas podem abrir um pouco mais devagar na primeira vez. Pede permissão de administrador.',
    risk: 'low', action: 'admin', method: 'admin-contents', regenerable: true, preselect: false,
    paths: (L) => [j(L.windir, 'Prefetch')],
  },
  {
    id: 'system.wer-system', category: 'system', group: 'Windows', name: 'Relatórios de erro (sistema)',
    whatItIs: 'Relatórios de erro do Windows de todas as contas deste PC.',
    afterCleaning: 'Nada muda no uso. Só some o histórico de erros. Pede permissão de administrador.',
    risk: 'low', action: 'admin', method: 'admin-contents', regenerable: true, preselect: false,
    paths: (L) => [j(L.programData, 'Microsoft', 'Windows', 'WER')],
  },
  {
    id: 'system.minidump', category: 'system', group: 'Windows', name: 'Dumps de travamento do Windows (Minidump)',
    whatItIs: 'Registros de quando o Windows travou ou mostrou tela azul.',
    afterCleaning: 'Nada muda no uso. Pede permissão de administrador.',
    risk: 'low', action: 'admin', method: 'admin-contents', regenerable: true, preselect: false,
    paths: (L) => [j(L.windir, 'Minidump')],
  },
  {
    id: 'system.windows-logs', category: 'system', group: 'Windows', name: 'Logs do Windows',
    whatItIs: 'Registros de instalação e manutenção do Windows, úteis para achar problemas.',
    afterCleaning: 'Você perde esse histórico, que ajuda a diagnosticar falhas de atualização. Pede permissão de administrador.',
    risk: 'medium', action: 'admin', method: 'admin-contents', regenerable: true, preselect: false,
    paths: (L) => [j(L.windir, 'Logs')],
  },
  // ---- Gráficos
  ...[
    ['nvidia-dx', 'NVIDIA', 'Cache de shaders NVIDIA (DX)', (L) => [j(L.localAppData, 'NVIDIA', 'DXCache')]],
    ['nvidia-gl', 'NVIDIA', 'Cache de shaders NVIDIA (OpenGL)', (L) => [j(L.localAppData, 'NVIDIA', 'GLCache')]],
    ['nvidia-nv', 'NVIDIA', 'Cache da NVIDIA (ProgramData)', (L) => [j(L.programData, 'NVIDIA Corporation', 'NV_Cache')]],
    ['amd', 'AMD', 'Cache de shaders AMD', (L) => ['DxCache', 'GLCache', 'VkCache', 'DxcCache'].map((d) => j(L.localAppData, 'AMD', d))],
    ['directx', 'DirectX', 'Cache de shaders do DirectX', (L) => [j(L.localAppData, 'D3DSCache')]],
  ].map(([id, group, name, paths]) => ({
    id: `graphics.${id}`, category: 'graphics', group, name,
    whatItIs: 'Peças de gráficos já prontas que os jogos e programas guardam para carregar mais rápido.',
    afterCleaning: 'Jogos e programas refazem o cache. Eles podem demorar um pouco mais na primeira abertura.',
    risk: 'low', action: 'clean', method: 'trash-contents', regenerable: true, preselect: true, paths,
  })),
  // ---- Aplicativos
  {
    id: 'apps.discord', category: 'apps', group: 'Discord', name: 'Cache do Discord',
    whatItIs: 'Imagens e arquivos que o Discord guarda para abrir mais rápido.',
    afterCleaning: CACHE_AFTER,
    risk: 'low', action: 'clean', method: 'trash-contents', regenerable: true, preselect: true,
    paths: (L) => ['Cache', 'Code Cache', 'GPUCache'].map((d) => j(L.appData, 'discord', d)),
  },
  {
    id: 'apps.spotify', category: 'apps', group: 'Spotify', name: 'Cache do Spotify',
    whatItIs: 'Músicas e capas que o Spotify guardou no PC para tocar sem baixar de novo.',
    afterCleaning: 'O Spotify baixa de novo o que você ouvir. Músicas baixadas para ouvir offline podem precisar ser baixadas outra vez.',
    risk: 'low', action: 'clean', method: 'trash-contents', regenerable: true, preselect: false,
    paths: async (L) => {
      const pk = await listDirs(j(L.localAppData, 'Packages'), (n) => /^SpotifyAB\.SpotifyMusic_/i.test(n));
      return [j(L.localAppData, 'Spotify', 'Data'), j(L.localAppData, 'Spotify', 'Storage'), ...pk.map((p) => j(p, 'LocalCache', 'Spotify', 'Data'))];
    },
  },
  {
    id: 'apps.teams', category: 'apps', group: 'Teams', name: 'Cache do Teams',
    whatItIs: 'Arquivos temporários do Microsoft Teams.',
    afterCleaning: 'O Teams refaz o cache. Pode pedir para entrar de novo em alguns casos.',
    risk: 'medium', action: 'clean', method: 'trash-contents', regenerable: true, preselect: false,
    paths: async (L) => {
      const pk = await listDirs(j(L.localAppData, 'Packages'), (n) => /^MSTeams_/i.test(n));
      return [
        ...['Cache', 'Code Cache', 'GPUCache', 'tmp'].map((d) => j(L.appData, 'Microsoft', 'Teams', d)),
        ...pk.map((p) => j(p, 'LocalCache')),
      ];
    },
  },
  {
    id: 'apps.vscode-cache', category: 'apps', group: 'VS Code', name: 'Cache do VS Code',
    whatItIs: 'Código já preparado e extensões baixadas que o VS Code guarda para abrir mais rápido.',
    afterCleaning: CACHE_AFTER,
    risk: 'low', action: 'clean', method: 'trash-contents', regenerable: true, preselect: true,
    paths: (L) => ['CachedData', 'Cache', 'CachedExtensionVSIXs'].map((d) => j(L.appData, 'Code', d)),
  },
  {
    id: 'apps.vscode-workspace', category: 'apps', group: 'VS Code', name: 'Dados de projetos do VS Code (workspaceStorage)',
    whatItIs: 'Estado que o VS Code guarda de cada projeto aberto: abas, buscas e índices das extensões.',
    afterCleaning: 'O VS Code perde abas e estados lembrados de projetos. O código dos projetos não é tocado.',
    risk: 'medium', action: 'clean', method: 'trash-contents', regenerable: false, preselect: false,
    paths: (L) => [j(L.appData, 'Code', 'User', 'workspaceStorage')],
  },
  // ---- Desenvolvimento: caches de pacotes
  ...[
    ['npm', 'npm', 'Cache do npm', 'low', 'trash-contents', (L) => [j(L.localAppData, 'npm-cache'), j(L.appData, 'npm-cache')], { file: 'npm', args: ['cache', 'clean', '--force'] }],
    ['pnpm', 'pnpm', 'Cache do pnpm (store)', 'low', 'command', (L) => [j(L.localAppData, 'pnpm', 'store'), j(L.localAppData, 'pnpm-store')], { file: 'pnpm', args: ['store', 'prune'] }],
    ['yarn', 'Yarn', 'Cache do Yarn', 'low', 'command', (L) => [j(L.localAppData, 'Yarn', 'Cache')], { file: 'yarn', args: ['cache', 'clean'] }],
    ['pip', 'pip', 'Cache do pip', 'low', 'command', (L) => [j(L.localAppData, 'pip', 'cache')], { file: 'pip', args: ['cache', 'purge'] }],
    ['uv', 'uv', 'Cache do uv', 'low', 'command', (L) => [j(L.localAppData, 'uv', 'cache')], { file: 'uv', args: ['cache', 'clean'] }],
    ['nuget', 'NuGet', 'Cache do NuGet', 'medium', 'command', (L) => [j(L.home, '.nuget', 'packages'), j(L.localAppData, 'NuGet', 'v3-cache')], { file: 'dotnet', args: ['nuget', 'locals', 'all', '--clear'] }],
    ['gradle', 'Gradle', 'Cache do Gradle', 'medium', 'trash', (L) => [j(L.home, '.gradle', 'caches')], null],
    ['maven', 'Maven', 'Repositório local do Maven', 'medium', 'trash', (L) => [j(L.home, '.m2', 'repository')], null],
    ['cargo', 'Cargo', 'Registro do Cargo (Rust)', 'medium', 'trash', (L) => [j(L.home, '.cargo', 'registry')], null],
    ['go', 'Go', 'Módulos do Go', 'low', 'command', (L) => [j(L.home, 'go', 'pkg', 'mod')], { file: 'go', args: ['clean', '-modcache'] }],
    ['playwright', 'Playwright', 'Navegadores do Playwright', 'low', 'trash', async (L) => listDirs(L.localAppData, (n) => /^ms-playwright/i.test(n)), null],
    ['cypress', 'Cypress', 'Cache do Cypress', 'low', 'trash', (L) => [j(L.localAppData, 'Cypress', 'Cache')], null],
  ].map(([id, group, name, risk, method, paths, command]) => ({
    id: `dev.cache-${id}`, category: 'dev', group: 'Caches de pacotes', name,
    whatItIs: `Pacotes e arquivos que o ${group} baixou e guarda para não baixar de novo.`,
    afterCleaning: 'Na próxima instalação ou build, o que for preciso é baixado de novo, e pode demorar mais.',
    risk, action: 'clean', method, regenerable: true, preselect: risk === 'low', paths, command,
    roots: paths,
  })),
];

/** Imagens de disco do Docker e do WSL (itens guiados). */
export async function vhdxPaths(L) {
  const out = [];
  const docker = j(L.localAppData, 'Docker', 'wsl');
  for (const d of ['disk', 'data', 'main']) for (const f of await listFiles(j(docker, d), /\.vhdx$/i)) out.push({ kind: 'docker', path: f });
  for (const pk of await listDirs(j(L.localAppData, 'Packages'))) {
    for (const f of await listFiles(j(pk, 'LocalState'), /^ext4\.vhdx$/i)) out.push({ kind: 'wsl', path: f });
  }
  for (const gd of await listDirs(j(L.localAppData, 'wsl'))) {
    for (const f of await listFiles(gd, /^ext4\.vhdx$/i)) out.push({ kind: 'wsl', path: f });
  }
  return out;
}

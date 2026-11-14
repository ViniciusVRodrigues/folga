import fs from 'node:fs';
import path from 'node:path';
import { walkLite, measure, dynId, makeItem, lstatSafe, readdirSafe, pathKey } from './util.js';

const DAY = 86400000;

const NODE = ['package.json'];
const PY = ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'];
const GRADLE = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];
const DOTNET = ['*.csproj', '*.fsproj', '*.vbproj', '*.sln'];

/** Artefato -> marcadores que precisam estar na pasta pai (como no kondo). */
export const ARTIFACTS = {
  node_modules: { markers: NODE, label: 'node_modules', what: 'Pacotes JavaScript baixados para este projeto.', after: 'Rode "npm install" (ou o gerenciador do projeto) para baixar de novo.' },
  '.next': { markers: NODE, label: '.next', what: 'Arquivos gerados pelo Next.js ao compilar este projeto.', after: 'São recriados na próxima compilação.' },
  '.nuxt': { markers: NODE, label: '.nuxt', what: 'Arquivos gerados pelo Nuxt ao compilar este projeto.', after: 'São recriados na próxima compilação.' },
  '.svelte-kit': { markers: NODE, label: '.svelte-kit', what: 'Arquivos gerados pelo SvelteKit ao compilar este projeto.', after: 'São recriados na próxima compilação.' },
  '.turbo': { markers: NODE, label: '.turbo', what: 'Cache do Turborepo deste projeto.', after: 'Os builds seguintes ficam mais lentos uma vez e o cache é refeito.' },
  '.parcel-cache': { markers: NODE, label: '.parcel-cache', what: 'Cache do Parcel deste projeto.', after: 'O próximo build refaz o cache.' },
  dist: { markers: NODE, label: 'dist', what: 'Pasta de saída da compilação deste projeto.', after: 'É recriada quando você compilar de novo.' },
  build: { markers: [...NODE, ...GRADLE, 'CMakeLists.txt'], label: 'build', what: 'Pasta de saída da compilação deste projeto.', after: 'É recriada quando você compilar de novo.' },
  target: { markers: ['Cargo.toml', 'pom.xml'], label: 'target', what: 'Pasta de saída da compilação (Rust ou Maven) deste projeto.', after: 'É recriada quando você compilar de novo.' },
  '.venv': { markers: PY, label: '.venv', what: 'Ambiente virtual do Python deste projeto.', after: 'Crie o ambiente de novo e reinstale os pacotes.' },
  venv: { markers: PY, label: 'venv', what: 'Ambiente virtual do Python deste projeto.', after: 'Crie o ambiente de novo e reinstale os pacotes.' },
  __pycache__: { markers: PY, label: '__pycache__', what: 'Código Python já compilado, guardado para abrir mais rápido.', after: 'O Python recria sozinho.' },
  '.gradle': { markers: GRADLE, label: '.gradle', what: 'Cache local do Gradle neste projeto.', after: 'O próximo build refaz o cache.' },
  bin: { markers: DOTNET, label: 'bin', what: 'Programas compilados deste projeto .NET.', after: 'São recriados na próxima compilação.' },
  obj: { markers: DOTNET, label: 'obj', what: 'Arquivos intermediários da compilação deste projeto .NET.', after: 'São recriados na próxima compilação.' },
};

const SKIP_ALWAYS = new Set(['node_modules', '.git']);
const DUMP_RE = /\.(hprof|dmp)$/i;
const MODEL_RE = /\.(gguf|safetensors)$/i;
const MODEL_MIN = 100 * 1024 ** 2;

function hasMarker(names, markers) {
  return markers.some((m) => (m.startsWith('*') ? names.some((n) => n.toLowerCase().endsWith(m.slice(1))) : names.includes(m)));
}

/** Data mais recente de um arquivo do projeto, fora dos artefatos (profundidade e quantidade limitadas). */
export async function lastTouched(root, { maxDepth = 3, maxEntries = 600 } = {}) {
  let newest = 0;
  let budget = maxEntries;
  async function go(dir, depth) {
    const ents = await readdirSafe(dir);
    if (!ents) return;
    const subs = [];
    for (const e of ents) {
      if (budget <= 0) return;
      if (e.isSymbolicLink() || SKIP_ALWAYS.has(e.name) || ARTIFACTS[e.name]) continue;
      budget--;
      const st = await lstatSafe(path.join(dir, e.name));
      if (st) newest = Math.max(newest, st.mtimeMs);
      if (e.isDirectory() && depth < maxDepth) subs.push(path.join(dir, e.name));
    }
    for (const s of subs) await go(s, depth + 1);
  }
  await go(root, 1);
  // atividade do git (commit, checkout) sem entrar na pasta inteira
  for (const f of ['index', 'HEAD']) {
    const st = await lstatSafe(path.join(root, '.git', f));
    if (st) newest = Math.max(newest, st.mtimeMs);
  }
  if (!newest) { const st = await lstatSafe(root); newest = st ? st.mtimeMs : 0; }
  return newest;
}

/**
 * Procura projetos, dumps e modelos grandes sob as raízes.
 * Devolve { artifacts: [{project, name, path}], files: [{path, kind}] }.
 */
export async function scanDevRoots(roots, { maxDepth = 8 } = {}) {
  const artifacts = new Map();
  const files = new Map();
  const seenRoots = new Set();
  for (const r of roots) {
    const k = pathKey(r);
    if (seenRoots.has(k)) continue;
    seenRoots.add(k);
    await walkLite(r, {
      maxDepth,
      async onDir(dir, ents) {
        const names = ents.map((e) => e.name);
        const skip = new Set();
        for (const e of ents) {
          if (e.isSymbolicLink()) continue;
          if (e.isDirectory()) {
            if (SKIP_ALWAYS.has(e.name) && e.name !== 'node_modules') { skip.add(e.name); continue; }
            const art = ARTIFACTS[e.name];
            if (e.name === 'node_modules' || art) {
              skip.add(e.name);
              if (art && hasMarker(names, art.markers)) {
                const p = path.join(dir, e.name);
                artifacts.set(pathKey(p), { project: dir, name: e.name, path: p });
              }
            }
          } else if (e.isFile() && (DUMP_RE.test(e.name) || MODEL_RE.test(e.name))) {
            const p = path.join(dir, e.name);
            files.set(pathKey(p), { path: p, kind: DUMP_RE.test(e.name) ? 'dump' : 'model' });
          }
        }
        return skip;
      },
    });
  }
  return { artifacts: [...artifacts.values()], files: [...files.values()] };
}

/** Itens de artefatos de projeto, um por artefato, agrupados por `project`. */
export async function projectItems(found, { now = Date.now() } = {}) {
  const touched = new Map();
  const touchedOf = (project) => {
    const k = pathKey(project);
    if (!touched.has(k)) touched.set(k, lastTouched(project));
    return touched.get(k);
  };
  const items = await Promise.all(found.map(async (a) => {
    const [m, lt] = await Promise.all([measure([a.path]), touchedOf(a.project)]);
    if (!m.size) return null;
    const art = ARTIFACTS[a.name];
    const name = path.basename(a.project) || a.project;
    return makeItem({
      id: dynId(`dev.${a.name}`, a.path),
      category: 'dev', group: 'Projetos de dev',
      name: `${art.label} de ${name}`,
      whatItIs: art.what,
      afterCleaning: art.after,
      risk: 'low', action: 'clean', method: 'trash', regenerable: true,
      preselect: !!lt && now - lt > 30 * DAY,
      paths: [a.path], roots: [a.project], size: m.size, unreadable: m.unreadable > 0,
      lastUsed: lt ? new Date(lt).toISOString() : null,
      project: { root: a.project, name, lastTouched: lt ? new Date(lt).toISOString() : null },
    });
  }));
  return items.filter(Boolean);
}

/** Itens de dumps de memória e modelos de IA. */
export async function fileItems(found) {
  const items = [];
  for (const f of found) {
    const st = await lstatSafe(f.path);
    if (!st || !st.isFile()) continue;
    const m = await measure([f.path]);
    if (f.kind === 'model') {
      if (st.size < MODEL_MIN) continue;
      items.push(makeItem({
        id: dynId('dev.model', f.path), category: 'dev', group: 'Modelos de IA',
        name: `Modelo de IA ${path.basename(f.path)}`,
        whatItIs: 'Arquivo de modelo de inteligência artificial, geralmente baixado para rodar na sua máquina.',
        afterCleaning: 'Se você usar o modelo de novo, será preciso baixar tudo outra vez.',
        risk: 'medium', action: 'clean', method: 'trash', regenerable: false, preselect: false,
        paths: [f.path], size: m.size, lastUsed: new Date(st.mtimeMs).toISOString(),
      }));
    } else {
      items.push(makeItem({
        id: dynId('dev.dump', f.path), category: 'dev', group: 'Dumps de memória',
        name: `Dump de memória ${path.basename(f.path)}`,
        whatItIs: 'Arquivo que um programa grava quando trava, com o conteúdo da memória. Serve só para achar o erro.',
        afterCleaning: 'Nada muda no uso do computador. Você só perde o registro daquele erro.',
        risk: 'low', action: 'clean', method: 'trash', regenerable: false, preselect: true,
        paths: [f.path], size: m.size, lastUsed: new Date(st.mtimeMs).toISOString(),
      }));
    }
  }
  return items;
}

/** Procura dumps e modelos em pastas conhecidas (fora das raízes de projetos). */
export async function scanFiles(dirs, { maxDepth = 5 } = {}) {
  const files = new Map();
  for (const d of dirs) {
    try { await fs.promises.access(d); } catch { continue; }
    await walkLite(d, {
      maxDepth,
      onDir(dir, ents) {
        for (const e of ents) {
          if (e.isFile() && (DUMP_RE.test(e.name) || MODEL_RE.test(e.name))) {
            const p = path.join(dir, e.name);
            files.set(pathKey(p), { path: p, kind: DUMP_RE.test(e.name) ? 'dump' : 'model' });
          }
        }
        return new Set(['node_modules', '.git']);
      },
    });
  }
  return [...files.values()];
}

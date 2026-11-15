import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanDevRoots, projectItems, lastTouched, fileItems } from '../src/catalog/dev.js';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'folga-dev-'));
const root = path.join(base, 'repos');
const w = (p, n = 10) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.alloc(n, 1)); };
const keys = (arr) => arr.map((a) => path.relative(root, a.path).replaceAll('\\', '/')).sort();

before(() => {
  // projeto node com node_modules, .next e node_modules aninhado
  w(path.join(root, 'app', 'package.json'));
  w(path.join(root, 'app', 'src', 'index.js'));
  w(path.join(root, 'app', 'node_modules', 'x', 'i.js'), 5000);
  w(path.join(root, 'app', 'node_modules', 'x', 'node_modules', 'y', 'i.js'), 5000);
  w(path.join(root, 'app', '.next', 'c.js'), 100);
  // build sem marcador
  w(path.join(root, 'solto', 'build', 'out.txt'), 100);
  w(path.join(root, 'solto', 'dist', 'out.txt'), 100);
  // cargo
  w(path.join(root, 'rs', 'Cargo.toml'));
  w(path.join(root, 'rs', 'target', 'debug', 'a.o'), 100);
  // dotnet por extensão
  w(path.join(root, 'cs', 'App.csproj'));
  w(path.join(root, 'cs', 'bin', 'a.dll'), 100);
  // monorepo
  w(path.join(root, 'mono', 'package.json'));
  w(path.join(root, 'mono', 'packages', 'a', 'package.json'));
  w(path.join(root, 'mono', 'packages', 'a', 'node_modules', 'z', 'i.js'), 100);
  // dump e modelo
  w(path.join(root, 'mono', 'java_pid1.hprof'), 2000);
  w(path.join(root, 'mono', 'small.gguf'), 2000);
  // alvo fora das raízes, apontado por junction
  w(path.join(base, 'fora', 'precioso.txt'), 100);
  w(path.join(base, 'fora', 'package.json'));
  w(path.join(base, 'fora', 'node_modules', 'q', 'i.js'), 100);
  fs.symlinkSync(path.join(base, 'fora'), path.join(root, 'ligado'), 'junction');
});
after(() => fs.rmSync(base, { recursive: true, force: true }));

test('só conta artefato com marcador na pasta pai', async () => {
  const { artifacts } = await scanDevRoots([root]);
  const k = keys(artifacts);
  assert.ok(k.includes('app/node_modules'));
  assert.ok(k.includes('app/.next'));
  assert.ok(k.includes('rs/target'));
  assert.ok(k.includes('cs/bin'));
  assert.ok(k.includes('mono/packages/a/node_modules'));
  assert.ok(!k.some((x) => x.startsWith('solto/')), 'build/dist sem marcador são ignorados');
});

test('node_modules aninhado não entra', async () => {
  const { artifacts } = await scanDevRoots([root]);
  assert.ok(!keys(artifacts).some((x) => x.includes('node_modules/')));
});

test('junction não é seguida', async () => {
  const { artifacts } = await scanDevRoots([root]);
  assert.ok(!keys(artifacts).some((x) => x.startsWith('ligado')));
});

test('itens agrupados por projeto, com tamanho e lastTouched', async () => {
  const { artifacts } = await scanDevRoots([root]);
  const items = await projectItems(artifacts);
  const nm = items.find((i) => i.id.startsWith('dev.node_modules:') && i.project.name === 'app');
  assert.ok(nm);
  assert.equal(nm.action, 'clean');
  assert.equal(nm.method, 'trash');
  assert.equal(nm.regenerable, true);
  assert.equal(nm.project.root, path.join(root, 'app'));
  assert.match(nm.id, /^dev\.node_modules:[0-9a-f]{12}$/);
  assert.ok(nm.size >= 8192);
  assert.ok(nm.project.lastTouched);
});

test('lastTouched ignora os artefatos', async () => {
  const p = path.join(base, 'lt');
  w(path.join(p, 'package.json'));
  w(path.join(p, 'node_modules', 'a.js'));
  const old = new Date('2020-01-01');
  fs.utimesSync(path.join(p, 'package.json'), old, old);
  fs.utimesSync(p, old, old);
  const recent = new Date();
  fs.utimesSync(path.join(p, 'node_modules', 'a.js'), recent, recent);
  fs.utimesSync(path.join(p, 'node_modules'), recent, recent);
  const t = await lastTouched(p);
  assert.ok(t <= old.getTime() + 1000, 'node_modules recente não conta');
});

test('dumps e modelos: dump vira item, modelo pequeno é ignorado', async () => {
  const { files } = await scanDevRoots([root]);
  const items = await fileItems(files);
  assert.ok(items.some((i) => i.id.startsWith('dev.dump:') && i.risk === 'low'));
  assert.ok(!items.some((i) => i.id.startsWith('dev.model:')));
});

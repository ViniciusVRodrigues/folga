import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVdf, steamLibraries, parseAppManifest } from '../src/catalog/vdf.js';

const LIB = `"libraryfolders"
{
\t"0"
\t{
\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"
\t\t"label"\t\t""
\t\t"apps"
\t\t{
\t\t\t"228980"\t\t"123"
\t\t}
\t}
\t"1"
\t{
\t\t"path"\t\t"D:\\\\SteamLibrary"
\t}
}
`;

const ACF = `"AppState"
{
\t"appid"\t\t"1085660"
\t"name"\t\t"Destiny \\"2\\""
\t"installdir"\t\t"Destiny 2"
\t"LastPlayed"\t\t"1790000000"
\t"SizeOnDisk"\t\t"73014444032"
\t// comentario
\t"UserConfig"
\t{
\t\t"language"\t\t"english"
\t}
}
`;

test('parser vdf: aninhamento, escapes e comentários', () => {
  const o = parseVdf(ACF);
  assert.equal(o.AppState.appid, '1085660');
  assert.equal(o.AppState.name, 'Destiny "2"');
  assert.equal(o.AppState.UserConfig.language, 'english');
});

test('libraryfolders.vdf devolve os caminhos com barras desescapadas', () => {
  assert.deepEqual(steamLibraries(LIB), ['C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary']);
});

test('appmanifest.acf devolve os campos do jogo', () => {
  assert.deepEqual(parseAppManifest(ACF), { appid: '1085660', name: 'Destiny "2"', installdir: 'Destiny 2', sizeOnDisk: 73014444032, lastPlayed: 1790000000 });
});

test('appmanifest inválido devolve null', () => {
  assert.equal(parseAppManifest('lixo {{'), null);
  assert.equal(parseAppManifest('"AppState" { "name" "x" }'), null);
});

#!/usr/bin/env node
// Precisa vir antes de qualquer módulo que faça I/O.
process.env.UV_THREADPOOL_SIZE ??= '32';

const { execFile } = await import('node:child_process');
const { startServer } = await import('../src/server.js');

const args = process.argv.slice(2);
let port = 0;
const i = args.indexOf('--port');
if (i !== -1) {
  port = Number(args[i + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('folga: --port precisa de um número entre 0 e 65535');
    process.exit(1);
  }
}
const noOpen = args.includes('--no-open');

const srv = await startServer({ port });
console.log(`folga rodando em ${srv.url}`);

if (!noOpen && process.platform === 'win32') {
  // O título vazio é '' (o Node o entrega como ""); a URL só tem http://127.0.0.1:porta/#t=hex.
  execFile('cmd', ['/c', 'start', '', srv.url], { windowsHide: true }, () => {});
}

const stop = () => { srv.close().then(() => process.exit(0)); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

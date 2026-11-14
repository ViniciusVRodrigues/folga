# Tasks — mvp-folga

Branch: `feat/mvp-folga`. Ordem: P1 → (P2a ∥ P2b) → P3 → P4.

## P1 — Núcleo: servidor, segurança e varredura
- [x] 1.1 `bin/folga.js`:
  - define `UV_THREADPOOL_SIZE=32` antes de qualquer I/O;
  - flags `--port` (padrão 0, porta aleatória) e `--no-open`;
  - abre o navegador em `http://127.0.0.1:<port>/#t=<token>`.
- [x] 1.2 `src/server.js`:
  - escuta em 127.0.0.1;
  - token, Host e Origin;
  - CSP e headers;
  - arquivos estáticos de `web/`;
  - SSE em `/api/events?t=`;
  - erros no formato do contrato.
- [x] 1.3 `src/scan/walk.js`:
  - varredura com concorrência limitada;
  - sem seguir reparse points;
  - deduplicação de hardlinks;
  - tamanho alocado;
  - prefixo `\\?\`;
  - noAccess;
  - cancelar.
- [x] 1.4 `GET /api/drives`, `POST /api/scan`, `POST /api/scan/cancel`, `GET /api/tree`, `GET /api/large-files`.
- [x] 1.5 Testes:
  - 403 sem token, com Host errado e com Origin de fora;
  - árvore de fixture com tamanhos exatos;
  - junction não seguida;
  - hardlink contado uma vez;
  - caminho > 260;
  - cancelar.

## P2a — Catálogo e detectores
- [ ] 2a.1 `src/platform/win32.js`: locais conhecidos, com variáveis de ambiente injetáveis nos testes.
- [ ] 2a.2 Catálogo com as categorias e textos pt-BR do `design.md`, cada item com os 4 campos.
- [ ] 2a.3 Detectores:
  - dev por marcador, com lastTouched;
  - Steam (vdf/acf);
  - Downloads;
  - dumps e modelos;
  - Docker/WSL guiado.
- [ ] 2a.4 `POST /api/cleanup/refresh` e `GET /api/cleanup`, com summary, checked e categorias ocultas quando vazias.
- [ ] 2a.5 Testes:
  - fixture de projetos (build sem marcador ignorado, node_modules aninhado não entra);
  - parser de vdf/acf;
  - navegador sem Cookies/Login Data;
  - safeNow.

## P2b — UI
- [x] 2b.1 `web/`: shell, tema, i18n pt-BR, cliente da API com token e SSE.
- [x] 2b.2 Telas: Resumo, O que pesa (treemap e lista), Categoria, Arquivos grandes, Varrer outra pasta.
- [x] 2b.3 SelectionBar, modal de confirmação e resumo da limpeza.
- [x] 2b.4 `web/lib/*` puro e testado: treemap squarified, formatação de bytes e datas, regras de seleção e pré-seleção.

## P3 — Limpeza
- [ ] 3.1 `src/clean/guard.js`: lista de protegidos, raiz permitida, reparse em ancestrais.
- [ ] 3.2 `src/clean/remove.js`: exclusão definitiva segura, sem seguir junctions.
- [ ] 3.3 Lixeira com `trash` e checagem de cota/NukeOnDelete; falha nunca vira exclusão definitiva.
- [ ] 3.4 Comandos oficiais por `execFile` (npm, pnpm, pip, uv, dotnet, yarn, go).
- [ ] 3.5 `POST /api/clean`, `GET /api/clean/:id`, `POST /api/recycle-bin/empty`, `POST /api/open`.
- [ ] 3.6 Testes:
  - guarda (protegidos, junction);
  - modo delete recusado em item não regenerável;
  - STALE_ITEM;
  - item de teste vai para a Lixeira.

## P4 — Admin/UAC
- [ ] 4.1 Gerador de script fixo, `GET /api/admin-script` e execução por `-EncodedCommand` com `Start-Process -Verb RunAs`; recusa do UAC leva a `admin-declined`.
- [ ] 4.2 Teste do hash do script exibido contra o executado.

## Entrega
- [ ] Regressão completa (verificador).
- [ ] qa-senior e ux-ui em validação.
- [ ] PR → merge.
- [ ] Arquivar a change.

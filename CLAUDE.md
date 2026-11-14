# folga

App web local (Node >= 20, ESM, sem build) para ver o que pesa no disco do Windows e limpar com segurança.

- Servidor em `src/`, UI estática em `web/` (JS puro, strings em `web/i18n/pt-BR.js`), testes em `test/` com `node --test`.
- Segurança é requisito: só `127.0.0.1`, token por execução, checagem de Host/Origin, o cliente manda IDs e nunca caminhos, guarda antes de cada remoção, nunca seguir junction/symlink, nunca rodar elevado, sem telemetria.
- Especificação e decisões: `openspec/` (changes e specs).
- Rodar: `npm start`. Testar: `npm test`.

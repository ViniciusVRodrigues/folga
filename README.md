# folga

Dê folga ao seu disco. O **folga** é um app local para Windows que mostra o que pesa no disco e ajuda a liberar espaço com segurança: arquivos temporários, caches de shader da placa de vídeo, caches de navegador e de apps, lixo de desenvolvimento (`node_modules`, `dist`, `target`, caches de npm/pip/NuGet…), jogos parados e arquivos grandes.

- **Roda só no seu PC.** O servidor escuta apenas em `127.0.0.1`, protegido por um token aleatório. Sem telemetria e sem chamadas de rede.
- **Nada apaga sozinho.** Você marca o que quer limpar e confirma. Por padrão, tudo vai para a Lixeira. Apagar de vez só existe para itens que se refazem sozinhos, e também pede confirmação.
- **Explica cada item:** o que é, quanto ocupa, o risco e o que acontece depois de limpar.
- **Pastas do sistema são protegidas.** O app nunca roda como administrador. Itens que exigem administrador passam pelo UAC do Windows com um script fixo que você vê antes.

> Status: MVP em construção (v0.1). Só Windows por enquanto.

## Requisitos
- Windows 10 ou 11
- Node.js 20 ou mais novo

## Como rodar
```bash
npx folga
```
Ou, a partir do código:
```bash
git clone https://github.com/ViniciusVRodrigues/folga.git
cd folga
npm install
npm start
```
O navegador abre sozinho em `http://127.0.0.1:<porta>`. Para escolher a porta: `npm start -- --port 4711`. Para não abrir o navegador: `--no-open`.

## Testes
```bash
npm test
```

## Licença
[MIT](LICENSE)

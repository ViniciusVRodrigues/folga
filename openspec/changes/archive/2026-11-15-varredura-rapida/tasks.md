# Tarefas: varredura-rapida (FOLGA-2)

## 1. Leitor rápido
- [x] 1.1 Pesquisa (WizTree, WinDirStat, FindFirstFileEx, MFT) e linha de base
- [x] 1.2 Protótipo `src/scan/win/FolgaScan.cs` (Add-Type, FileIdBothDirectoryInfo, 16 threads)
- [x] 1.3 Testes: suíte do walker rodando nos dois backends; parser do protocolo; script sem interpolação da pasta
- [x] 1.4 `src/scan/fast.js` (inicia o leitor, lê o arquivo de saída, monta a árvore) e escolha de backend em `scanTree`
- [x] 1.5 Cancelamento por arquivo-sinal e saída quando o servidor morre

## 2. Leitura como administrador
- [x] 2.1 `POST /api/scan { admin: true }`, UAC recusado mantém a varredura anterior (`declined`)
- [x] 2.2 Mapa: contador de pastas sem acesso e botão "Ler como administrador"

## 3. Entrega
- [x] 3.1 Medição antes × depois no C: e em `C:\Windows`
- [x] 3.2 verificador, qa-senior e ux-ui (validação): aprovados; sugestões do QA aplicadas (PowerShell pelo caminho completo, leitor sai se a pasta temporária sumir)
- [x] 3.3 PR, merge, arquivar a change, quadro

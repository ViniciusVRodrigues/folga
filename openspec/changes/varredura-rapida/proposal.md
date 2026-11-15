# Proposal: varredura rápida e leitura como administrador

Issue: https://github.com/ViniciusVRodrigues/folga/issues/3
Cartão: FOLGA-2

## Por quê
No uso real (15/11), a varredura do C: (~1 TB, 2,4 milhões de arquivos) levou minutos sem terminar. Ela ficou presa em `C:\Windows\WinSxS`, com pastas "Sem acesso". O walker atual faz `readdir` e depois um `lstat` por arquivo. No Windows, cada `lstat` abre o arquivo, e o libuv só tem 4 threads.

## O que muda
- **Leitor rápido no Windows.** Um leitor em C# é compilado na hora pelo PowerShell 5.1 (`Add-Type`, sem binário no pacote). Ele lista cada pasta com `GetFileInformationByHandleEx(FileIdBothDirectoryInfo)`, que já traz tamanho, tamanho alocado, data, atributos e FileId. Usa 16 threads, agrega por pasta e manda ao Node só as pastas, os 50 maiores arquivos de cada uma e os arquivos grandes.
- **Hardlinks** (WinSxS × System32) contados uma vez, pelo FileId.
- **Reparse points:** junction e symlink (tags "name surrogate") não são seguidos. OneDrive e outras pastas de nuvem continuam sendo lidas.
- **Alternativa:** se o PowerShell ou o compilador faltar, cai no walker atual, sem erro.
- **Leitura como administrador:** quando sobram pastas sem acesso, o mapa oferece "Ler como administrador". Só o leitor sobe pelo UAC, com o privilégio de backup, e só lê. O servidor continua sem elevação.

## Números (este PC, C: de 953 GB)
- Antes: em 300 s o walker em JS não terminou (1,96 mi de arquivos, 7.609 entradas/s).
- Depois: C: inteiro em 44,5 s (2,44 mi de arquivos, 425 mil pastas, 64.309 entradas/s), 8,5× mais rápido. Detalhes em `design.md`.

## Fora do escopo
- Leitura direta da MFT: com o leitor novo, o C: inteiro leva ~40 s. A MFT exigiria admin sempre e um parser de formato cru, risco que não compensa agora.
- Linux e macOS continuam no walker em JS.

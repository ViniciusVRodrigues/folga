# Design: varredura rápida e leitura como administrador

## Pesquisa: como os outros fazem
- **WizTree** lê a MFT do NTFS direto, como administrador. Por isso varre um disco inteiro em segundos ([diskanalyzer.com/about](https://diskanalyzer.com/about), [what's new](https://www.diskanalyzer.com/whats-new)). Sem admin, ele cai na enumeração comum de pastas.
- **WinDirStat 2.5** passou a ler a MFT quando roda como admin; sem admin, usa a enumeração de pastas ([AlternativeTo, jan/2026](https://alternativeto.net/news/2026/1/windirstat-2-5-adds-dark-mode-ntfs-mft-scanning-improved-search-and-new-file-actions)).
- **TreeSize** e **dust/dua/pdu** listam pastas em paralelo. A chamada certa no Windows devolve tamanho e atributos junto com o nome, sem abrir cada arquivo ([FastDirectoryEnumerator](https://github.com/ned14/FastDirectoryEnumerator)).
- **Hardlinks:** o caminho mais seguro é contar cada arquivo uma vez, pelo par volume + FileId ([edirstat](https://docs.rs/crate/edirstat/2.0.0)).
- **USN/MFT** (`FSCTL_ENUM_USN_DATA`): os registros não trazem tamanho ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_enum_usn_data)). Para ter tamanho, seria preciso ler a MFT crua com admin.
- **No Node:** `fs.readdir` + `lstat` abre cada arquivo, e o pool do libuv tem 4 threads. Não há módulo nativo pronto sem build. O .NET Framework 4.8 vem no Windows 10 e 11 ([Microsoft Learn](https://learn.microsoft.com/lb-lu/dotnet/framework/install/on-windows-11)), e o PowerShell 5.1 compila C# com `Add-Type`.

## Decisões
1. **Leitor em C#, compilado na hora.** `src/scan/win/FolgaScan.cs` usa `CreateFileW` (com `FILE_FLAG_OPEN_REPARSE_POINT`) e `GetFileInformationByHandleEx(FileIdBothDirectoryInfo)` com buffer de 256 KB e 16 threads. Uma chamada devolve dezenas de entradas já com tamanho, tamanho alocado, data, atributos, tag de reparse e FileId. Compilar leva ~0,8 s. O pacote não leva binário.
2. **Protocolo em TSV num arquivo temporário.** Uma linha por pasta (o pai sempre antes dos filhos), os 50 maiores arquivos de cada pasta, os arquivos grandes, o progresso a cada 250 ms e uma linha de fim. Nomes com caractere de controle vão em base64. O Node lê o arquivo enquanto ele cresce. Assim o modo normal e o admin funcionam igual, já que o processo elevado não herda pipes.
3. **Reparse points:** só as tags "name surrogate" (bit `0x20000000`: junction, symlink, mount point) não são seguidas. Pastas de nuvem, como o OneDrive, têm tag de reparse mas são pastas de verdade, e continuam sendo lidas.
4. **Hardlinks:** contados uma vez, pelo FileId, num conjunto dividido em 64 partes. A primeira pasta que vê o arquivo fica com ele. Os testes não dependem de qual pasta ganha.
5. **Tamanho alocado:** o leitor usa o `AllocationSize` real (arquivo comprimido, esparso ou em nuvem fica menor). O walker em JS continua estimando por cluster de 4 KiB.
6. **Alternativa:** se o leitor não lê nem a primeira pasta (sem PowerShell, sem compilador, política do sistema), `scanTree` cai no walker em JS. Lida a primeira pasta, erro do leitor vira varredura parcial.
7. **Cancelar:** o Node cria um arquivo-sinal. O leitor confere esse arquivo, e se o processo do servidor ainda existe, a cada 250 ms e logo ao iniciar. No modo normal, o Node também encerra o processo depois de 600 ms.
8. **Admin:** só o leitor sobe, por `Start-Process -Verb RunAs`. O script interno lê os bytes do .cs uma vez, confere o sha256 calculado pelo servidor e compila esses mesmos bytes. A pasta vai só em base64, nunca interpolada no script. Com admin, o leitor liga o `SeBackupPrivilege` e lê pastas protegidas sem mudar permissões. UAC recusado (código 1223) devolve `declined`, e a varredura anterior continua valendo.
9. **Sem MFT por enquanto:** com o leitor novo, o C: inteiro leva menos de um minuto sem admin. A MFT exigiria admin sempre e um parser de formato cru e sem documentação oficial completa: risco alto para pouco ganho.

## Proteções do leitor elevado e riscos que ficam
- O PowerShell é chamado pelo caminho completo do System32. Pelo nome, o `Start-Process -Verb RunAs` procuraria antes na pasta atual.
- A saída é aberta sem seguir reparse point e recusada se for pasta, link ou hardlink.
- O leitor sai se a pasta temporária sumir. Isso cobre quem cancela logo depois de aceitar o UAC.
- Ficam como risco:
  - Trocar a pasta temporária inteira por uma junção só funciona se o alvo já tiver um `out.tsv` comum com um só link. Para fechar de vez, falta conferir o caminho final do handle (`GetFinalPathNameByHandle`).
  - O `Add-Type` grava o compilado na pasta temporária do usuário, como em qualquer uso dele.
  - Uma pasta que falha depois de aberta some da árvore sem contar como "sem acesso".
  - A limpeza como admin (`src/clean/admin.js`) ainda chama `powershell.exe` pelo nome. Fica para outro cartão.

## Medição (este PC: Windows 11, C: NTFS de 953 GB, SSD NVMe)
| Caso | Antes (walker em JS) | Depois (leitor rápido) |
| --- | --- | --- |
| C: inteiro, 1ª rodada | parada em 300 s sem terminar: 1,96 mi arquivos, 7.609 entradas/s (cache quente, outros processos rodando) | completo em 44,5 s: 2,44 mi arquivos, 425 mil pastas, 931 GB, 64.309 entradas/s |
| C: inteiro, um logo depois do outro, nada mais rodando | parada em 300 s sem terminar: 304 mil arquivos, 1.438 entradas/s | completo em 80,6 s: 35.670 entradas/s (~25×) |
| `C:Windows`, cache quente, um depois do outro | 43,6 s | 23 s pelo Node (16 s só o leitor), ~1,9× |

O tempo varia bastante com o estado do cache do disco: o mesmo walker em JS fez de 1.438 a 7.609 entradas/s, e o leitor rápido fez de 35 mil a 64 mil. Em nenhuma rodada o walker em JS terminou o C: em 300 s; o leitor rápido terminou sempre, em 45 a 81 s. Em `C:Windows`, os dois leem as mesmas 137.421 entradas de arquivo e 104.846 pastas, com o mesmo total (32,99 GB) e as mesmas 47 pastas sem acesso. Ali o ganho é menor (1,9×), porque o WinSxS tem muitos hardlinks e pastas pequenas.

Reproduzir: `node bench/scan-bench.js C: 300 fast` (ou `js`).

## Teste real do UAC (15/11, com a pessoa clicando)
- "Sim": o leitor elevado leu uma pasta com permissão de leitura negada ao usuário (0 sem acesso, `admin: true`).
- "Não": voltou `declined: true` (código 1223), sem ler nada.

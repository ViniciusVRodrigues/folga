# scan Specification

## Purpose
TBD - created by archiving change mvp-folga. Update Purpose after archive.
## Requirements
### Requirement: Varredura com progresso e cancelamento
O app SHALL varrer uma pasta ou unidade escolhida em paralelo, sem abrir cada arquivo quando a listagem do sistema já traz o tamanho. SHALL NOT seguir junctions nem symlinks (reparse points do tipo "name surrogate"), mas SHALL ler pastas de nuvem como o OneDrive. SHALL contar hardlinks uma vez. SHALL emitir progresso no máximo a cada 250 ms e permitir cancelar em até 1 s, mantendo o resultado parcial. No Windows, SHALL usar o leitor rápido e, se ele não puder ser iniciado, o walker em JS, com o mesmo formato de resultado.

#### Scenario: Pasta sem acesso
- **WHEN** uma subpasta devolve EPERM
- **THEN** a varredura continua, a pasta fica `noAccess` e o contador `unreadable` aumenta

#### Scenario: Cancelar
- **WHEN** a pessoa cancela no meio
- **THEN** em até 1 s chega `scan-done` com `partial: true` e a árvore parcial fica navegável

#### Scenario: Hardlink
- **WHEN** dois nomes apontam para o mesmo arquivo
- **THEN** o tamanho entra uma vez só no total

#### Scenario: Leitor rápido indisponível
- **WHEN** o PowerShell ou o compilador não estão disponíveis
- **THEN** a varredura roda pelo walker em JS e o resultado tem o mesmo formato

#### Scenario: C: inteiro
- **WHEN** a pessoa varre o C: de ~1 TB e ~2,4 milhões de arquivos
- **THEN** a varredura termina em menos de 2 minutos

### Requirement: O que pesa
O app SHALL expor a árvore por pasta, com os filhos em ordem decrescente de tamanho, até um limite, e o restante agregado. SHALL também expor os arquivos de 500 MB ou mais.

#### Scenario: Navegar
- **WHEN** a UI pede `/api/tree` de uma pasta varrida
- **THEN** recebe os filhos ordenados, com `parent` e `more`

#### Scenario: Caminho longo
- **WHEN** a árvore tem um caminho com mais de 260 caracteres
- **THEN** o tamanho dele é contado sem erro

### Requirement: Leitura como administrador
Quando uma varredura termina com pastas sem acesso, o app SHALL oferecer ler de novo como administrador. SHALL elevar, pelo UAC, só o leitor, que é somente leitura. O servidor SHALL continuar sem elevação. Se a pessoa recusar o UAC, a varredura anterior SHALL continuar disponível.

#### Scenario: UAC recusado
- **WHEN** a pessoa recusa o UAC
- **THEN** chega `scan-done` com `declined: true` e a árvore anterior continua navegável

#### Scenario: Servidor encerrado
- **WHEN** o servidor termina enquanto o leitor elevado roda
- **THEN** o leitor percebe em até 1 s e sai


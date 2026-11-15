## ADDED Requirements

### Requirement: Varredura com progresso e cancelamento
O app SHALL varrer uma pasta ou unidade escolhida em paralelo, sem seguir symlinks e junctions e contando hardlinks uma vez. SHALL emitir progresso no máximo a cada 250 ms e permitir cancelar em até 1 s, mantendo o resultado parcial.

#### Scenario: Pasta sem acesso
- **WHEN** uma subpasta devolve EPERM
- **THEN** a varredura continua, a pasta fica `noAccess` e o contador `unreadable` aumenta

#### Scenario: Cancelar
- **WHEN** a pessoa cancela no meio
- **THEN** em até 1 s chega `scan-done` com `partial: true` e a árvore parcial fica navegável

### Requirement: O que pesa
O app SHALL expor a árvore por pasta, com os filhos em ordem decrescente de tamanho, até um limite, e o restante agregado. SHALL também expor os arquivos de 500 MB ou mais.

#### Scenario: Navegar
- **WHEN** a UI pede `/api/tree` de uma pasta varrida
- **THEN** recebe os filhos ordenados, com `parent` e `more`

#### Scenario: Caminho longo
- **WHEN** a árvore tem um caminho com mais de 260 caracteres
- **THEN** o tamanho dele é contado sem erro

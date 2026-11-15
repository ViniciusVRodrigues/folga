## ADDED Requirements

### Requirement: Catálogo de limpeza explicado
Cada item SHALL trazer nome, "o que é", "depois de limpar", tamanho, risco (`low`, `medium` ou `high`), ação (`clean`, `guided` ou `admin`), `regenerable` e `preselect`, em pt-BR simples. As categorias sem nada detectado no PC SHALL ficar ocultas e aparecer só na lista `checked`.

#### Scenario: Resumo seguro
- **WHEN** o catálogo é medido
- **THEN** `summary.safeNow` é a soma dos itens `low`, `clean` e sem admin

#### Scenario: Navegador
- **WHEN** o catálogo lista caches do Chrome ou do Edge
- **THEN** nenhum caminho aponta para Cookies, Login Data, Local Storage ou IndexedDB

### Requirement: Lixo de dev por projeto
O app SHALL detectar artefatos (`node_modules`, `.next`, `dist`, `build`, `target`, `.turbo`, `.venv`, `__pycache__`, `.gradle`, `bin`/`obj` …) só quando o arquivo-marcador do projeto está na pasta pai, com `lastTouched` igual à data mais recente dos arquivos do projeto fora dos artefatos. SHALL NOT entrar em `node_modules` aninhado.

#### Scenario: build sem marcador
- **WHEN** existe uma pasta `build` sem marcador de projeto ao lado
- **THEN** ela não vira item

#### Scenario: node_modules em C:\GitHub
- **WHEN** o detector de dev varre `C:\GitHub`
- **THEN** lista os `node_modules` dos projetos com tamanho e data da última mexida (cerca de 45 pastas e 12 GB, segundo a ARM-0)

### Requirement: Jogos e grandes são guiados
Os jogos da Steam (lidos de `libraryfolders.vdf` e `appmanifest_*.acf`), o vhdx do Docker e do WSL, o WinSxS e os arquivos grandes SHALL ser itens `guided`, sem caminho de exclusão pelo app.

#### Scenario: Jogo
- **WHEN** a pessoa escolhe desinstalar um jogo
- **THEN** o app abre `steam://uninstall/<appid>` e não apaga nada

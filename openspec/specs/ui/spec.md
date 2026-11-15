# ui Specification

## Purpose
TBD - created by archiving change mvp-folga. Update Purpose after archive.
## Requirements
### Requirement: Telas do MVP
A UI SHALL ter estas telas:
- Resumo de entrada;
- O que pesa (treemap e lista sincronizados);
- uma tela por categoria;
- Arquivos grandes;
- Varrer outra pasta;
- o modal de confirmação;
- o resumo da limpeza.

A UI SHALL estar em pt-BR, com as strings num arquivo de mensagens. O tema SHALL seguir o sistema e ter um botão para alternar.

#### Scenario: Larguras
- **WHEN** a tela é aberta a 390 e a 1280 px, nos dois temas
- **THEN** não há rolagem horizontal, e a 390 o menu vira uma barra inferior com alvos de pelo menos 44 px

#### Scenario: Modal
- **WHEN** o modal de confirmação abre
- **THEN** o foco está em "Cancelar", Esc fecha e o foco volta ao botão de origem

#### Scenario: Risco acessível
- **WHEN** um item é exibido
- **THEN** o risco tem ícone e texto, e os itens guiados ou protegidos não têm checkbox

### Requirement: Oferecer leitura como administrador
Depois de uma varredura no Windows com pastas sem acesso, o mapa SHALL mostrar quantas são e um botão "Ler como administrador". O botão SHALL avisar que o Windows vai pedir permissão. Recusada a permissão, a tela SHALL dizer que nada mudou.

#### Scenario: Pastas sem acesso
- **WHEN** a varredura termina com `unreadable > 0`
- **THEN** o mapa mostra "N pastas sem acesso" e o botão "Ler como administrador"

#### Scenario: Já lido como administrador
- **WHEN** a varredura atual já foi feita como administrador
- **THEN** o botão não aparece


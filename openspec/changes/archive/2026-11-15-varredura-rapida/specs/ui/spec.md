## ADDED Requirements

### Requirement: Oferecer leitura como administrador
Depois de uma varredura no Windows com pastas sem acesso, o mapa SHALL mostrar quantas são e um botão "Ler como administrador". O botão SHALL avisar que o Windows vai pedir permissão. Recusada a permissão, a tela SHALL dizer que nada mudou.

#### Scenario: Pastas sem acesso
- **WHEN** a varredura termina com `unreadable > 0`
- **THEN** o mapa mostra "N pastas sem acesso" e o botão "Ler como administrador"

#### Scenario: Já lido como administrador
- **WHEN** a varredura atual já foi feita como administrador
- **THEN** o botão não aparece

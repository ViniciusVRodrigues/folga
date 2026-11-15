## ADDED Requirements

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

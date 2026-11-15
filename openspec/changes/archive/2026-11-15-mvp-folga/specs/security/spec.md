## ADDED Requirements

### Requirement: Servidor só local e autenticado
O servidor SHALL escutar apenas em 127.0.0.1 e exigir em toda rota `/api/*` o token aleatório gerado na inicialização. Também SHALL recusar com 403 um Host diferente de `127.0.0.1:<porta>` ou `localhost:<porta>` e um Origin presente que não seja o do próprio app.

#### Scenario: Chamada sem token
- **WHEN** uma requisição a `/api/clean` chega sem `X-Token`
- **THEN** a resposta é 403 `FORBIDDEN` e nada é executado

#### Scenario: DNS rebinding
- **WHEN** uma requisição chega com `Host: evil.example:4711`
- **THEN** a resposta é 403

#### Scenario: Origin de outro site
- **WHEN** uma requisição POST chega com `Origin: https://evil.example`
- **THEN** a resposta é 403

### Requirement: Cliente nunca escolhe caminhos para apagar
A limpeza SHALL aceitar apenas IDs de itens da sessão atual. O servidor SHALL revalidar cada caminho imediatamente antes de remover: o caminho existe, não é ponto de reparse nem está sob um, fica dentro da raiz permitida do item e não está na lista de protegidos.

#### Scenario: ID desconhecido
- **WHEN** o corpo traz um ID que não existe na sessão
- **THEN** a resposta é 409 `STALE_ITEM` e nenhum item é limpo

#### Scenario: Junction dentro de node_modules
- **WHEN** um `node_modules` com uma junction para uma pasta externa é apagado de vez
- **THEN** a junction é removida e a pasta externa continua intacta

#### Scenario: Caminho protegido
- **WHEN** um item resolve para `C:\Windows`, a raiz de uma unidade, `Program Files` ou a raiz do perfil
- **THEN** a guarda recusa e o item termina como `failed` com o motivo `protected`

### Requirement: Nunca elevado, sem telemetria
O processo SHALL rodar sem elevação. Itens de admin SHALL rodar por UAC com um script montado só de caminhos fixos do catálogo, passado inline (`-EncodedCommand`), idêntico ao exibido em "Ver script". O app SHALL NOT fazer chamadas de rede.

#### Scenario: Script exibido igual ao executado
- **WHEN** a UI pede `/api/admin-script` para um conjunto de itens e depois limpa esses itens
- **THEN** o sha256 do script executado é igual ao exibido

# security Specification

## Purpose
TBD - created by archiving change mvp-folga. Update Purpose after archive.
## Requirements
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
O processo do servidor SHALL rodar sem elevação. Só dois tipos de filho podem subir pelo UAC:
- itens de admin, com um script montado só de caminhos fixos do catálogo, passado inline (`-EncodedCommand`) e idêntico ao exibido em "Ver script";
- o leitor de varredura, somente leitura. Ele compila o código do próprio pacote só se o sha256 bater com o que o servidor calculou, e recebe a pasta em base64, nunca interpolada no script.

O app SHALL NOT fazer chamadas de rede.

#### Scenario: Script exibido igual ao executado
- **WHEN** a UI pede `/api/admin-script` para um conjunto de itens e depois limpa esses itens
- **THEN** o sha256 do script executado é igual ao exibido

#### Scenario: Caminho com aspas na varredura elevada
- **WHEN** a pasta pedida contém `'` ou `;`
- **THEN** o script do leitor só contém essa pasta em base64

#### Scenario: Código do leitor alterado
- **WHEN** o arquivo do leitor muda entre o cálculo do hash e a compilação
- **THEN** o leitor não roda


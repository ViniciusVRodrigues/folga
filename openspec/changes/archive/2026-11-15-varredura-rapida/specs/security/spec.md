## MODIFIED Requirements

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

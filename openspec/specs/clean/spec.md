# clean Specification

## Purpose
TBD - created by archiving change mvp-folga. Update Purpose after archive.
## Requirements
### Requirement: Limpeza confirmada, Lixeira por padrão
A limpeza SHALL acontecer só por `POST /api/clean`, depois da confirmação na UI. O modo padrão SHALL ser a Lixeira. O modo `delete` SHALL ser aceito só para itens `regenerable`. Antes de limpar, o servidor SHALL marcar `permanent: true` nos itens que o Windows apagaria de vez (Lixeira desligada ou item acima da cota).

#### Scenario: Item de teste vai para a Lixeira
- **WHEN** um item de teste é limpo no modo `trash`
- **THEN** ele some do lugar e aparece na Lixeira

#### Scenario: Falha não vira exclusão definitiva
- **WHEN** o envio à Lixeira falha (caminho fundo demais, arquivo em uso)
- **THEN** o item termina `failed` com o motivo, e nada é apagado de vez

#### Scenario: delete em item não regenerável
- **WHEN** o corpo pede `mode: "delete"` para um item de Downloads
- **THEN** a resposta é 400

### Requirement: Resumo final
Ao fim, o job SHALL informar o total liberado, quanto foi para a Lixeira, quanto foi apagado de vez, cada item com falha e o motivo, e o novo espaço livre da unidade.

#### Scenario: Concluído com falha parcial
- **WHEN** um item está em uso e outro é limpo
- **THEN** o resumo lista o primeiro como `failed` (`in-use`) e soma só o segundo em `freed`


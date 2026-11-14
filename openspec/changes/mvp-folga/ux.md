# Plano de telas (ux-ui, v1 + v2 condensados)

Visual "Ferramenta sóbria". Tema escuro e claro, que segue `prefers-color-scheme`; o botão de alternar grava a escolha em `localStorage` dentro de try/catch.

| Token | Escuro | Claro |
|---|---|---|
| bg | #0F1115 | #FFFFFF |
| text | #E6E8EB | #16181D |
| text-2 | #9AA3AF | #5B6470 |
| accent | #5AB0FF | #0B63CE |
| low | #4ADE80 | #15803D |
| medium | #FBBF24 | #A16207 |
| high | #F87171 | #B91C1C |

Números com `tabular-nums` e alinhados à direita. Bytes em base 1024, como o Explorer, com rótulo "GB". Caminhos em fonte mono, com elipse no meio e o caminho inteiro no `title`.

## Navegação
- **1280 px:** menu lateral com Resumo, O que pesa, a seção "Limpeza" (as categorias, cada uma com o total), Arquivos grandes e Varrer outra pasta.
- **390 px:** barra inferior fixa com Resumo, O que pesa, Limpeza e Varrer. Ela também aparece a 1280 px com zoom de 200%; o ponto de quebra é ~720 px.
- Categorias sem nada detectado ficam ocultas. O resumo mostra "Verificado: NVIDIA, AMD, Steam…".

## Resumo (entrada)
- Faixa de alerta quando o espaço livre está abaixo de 10%, por exemplo "C: está quase cheio: 1,7% livre". Usa ícone, texto e cor.
- Dois números: "Dá para liberar agora com segurança" (risco baixo, ação clean, sem admin) e "Pede decisão sua".
- CTA "Revisar e limpar itens seguros…", que pré-seleciona todos os itens de risco baixo e abre o modal. O modal de confirmação é sempre obrigatório.
- Lista de categorias com barra e os chips seguro / admin / decisão.
- Outras unidades em cards menores, com "Varrer D:".

## O que pesa
- **1280 px:** treemap squarified em SVG (60%) e lista (40%). O breadcrumb fica fixo, com "Subir" e "Varrer de novo".
- **390 px:** abas "Lista | Mapa", com Lista por padrão.
- A lista é a fonte da verdade, e o foco é sincronizado entre lista e treemap.
- Mostra os primeiros 200 itens e agrupa o resto em "N itens a mais (X GB)". Tiles menores que 4 px são agrupados.
- Estados:
  - varrendo: contadores, bytes, pasta atual e "Cancelar";
  - parcial: selo "Varredura parcial";
  - sem acesso: badge por pasta e um resumo "N pastas sem acesso".

## Card de item (CleanupItem)
- **Linha 1:** checkbox de 44 px (só na ação clean), nome em linguagem simples e o tamanho.
- **Linha 2:**
  - RiskBadge com ícone e texto: "Baixo · se refaz sozinho", "Médio · pode perder algo", "Alto · não é apagado aqui";
  - chip "Exige administrador" com o escudo;
  - "Usado pela última vez há 8 meses".
- **Corpo:** "O que é: …" e "Depois de limpar: …".
- **"Detalhes"** (`<details>`): caminho completo e arquivos em uso.
- **Itens guiados não têm checkbox.** Trazem um botão:
  - "Abrir na Steam para desinstalar";
  - "Ver passos";
  - "Abrir no Explorer";
  - "Copiar comando".
- **Dev:** os itens vêm agrupados por projeto.
- **Jogos:** tabela com tamanho, "Jogado pela última vez" e biblioteca.

## Seleção e modal
- A SelectionBar fixa mostra "N itens · X GB · Limpar…" e acumula a seleção entre categorias.
- O modal agrupa os itens por categoria, com subtotais. A seção "Exige administrador (o Windows vai pedir permissão)" vem por último, com "Ver script" em `<pre>` focável e um botão "Copiar".
- Cada linha mostra "Vai para a Lixeira" ou "Apaga de vez", com ícone. O item regenerável tem o seletor "Lixeira | Apagar de vez", com Lixeira por padrão.
- Itens de risco médio pedem a caixa "Entendo o que vou perder".
- O foco inicial fica em "Cancelar". Esc fecha e o foco volta à origem.

## Limpando e resumo final
- A limpeza mostra o progresso por item.
- Estados do admin:
  - aguardando: "Esperando a permissão do Windows…";
  - recusado: "Permissão não dada: itens de admin pulados".
- O resumo final traz:
  - o total liberado, com o que foi para a Lixeira separado do que foi apagado de vez;
  - "Esvaziar Lixeira…", com confirmação própria;
  - as falhas, com motivo e "Tentar de novo";
  - o novo espaço livre de C:.
- Depois da limpeza, o foco vai para o título do resumo.

## Acessibilidade
- Teclado no treemap com roving tabindex: setas, Enter entra, Backspace ou Alt+↑ sobe.
- Teclado na lista: ↑↓, Enter, Espaço.
- `aria-live="polite"` no progresso, no máximo a cada 2 s.
- Itens protegidos usam `aria-disabled`, com o motivo lido.
- Lista e tabela usam semântica real.
- Alvos de 44 px ou mais a 390.
- `prefers-reduced-motion` é respeitado.

## Critérios de aceite (verificáveis)
1. `scrollWidth <= clientWidth` a 390 e a 1280, nos dois temas.
2. Alvos de 44×44 ou mais a 390.
3. Contraste AA: texto 4.5:1; UI e foco 3:1.
4. Todo RiskBadge tem ícone e texto.
5. Itens guiados, de risco alto ou protegidos não têm checkbox.
6. O aria-live recebe no máximo 1 mutação a cada 2 s.
7. Cancelar a varredura leva até 1 s e mostra "Varredura parcial".
8. O fluxo completo funciona só com teclado.
9. Foco do modal: abre em Cancelar, Esc fecha e o foco volta à origem.
10. O resumo separa a Lixeira do que foi apagado de vez e lista as falhas com motivo.
11. Todo CleanupItem tem os 4 campos preenchidos.
12. "Dá para liberar agora" é igual à soma dos itens low, clean e sem admin.
13. A pré-seleção do CTA nunca inclui risco médio, Downloads ou admin.
14. Os caminhos de navegador nunca incluem Cookies, Login Data ou Local Storage.

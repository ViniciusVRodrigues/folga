# Proposal: MVP do folga

Issue: https://github.com/ViniciusVRodrigues/folga/issues/1
Cartão de origem: ARM-1 (quadro "Meu Computador").

## Por quê
Falta uma ferramenta simples, local e confiável que mostre o que pesa no disco e ajude a liberar espaço sem medo de apagar o que não deve.

O raio-x deste PC (ARM-0, 2026-11-14) mostra o caso real:
- C: tem 953 GB e só 1,7% livres.
- A Steam ocupa 598 GB e o vhdx do Docker, 73 GB.
- Dá uns 20 GB de limpeza segura, espalhados em Temp, caches, Lixeira e dumps.

## O que muda
Um app web local (`npx folga`) que:
- abre num **resumo**: espaço livre, quanto dá para liberar com segurança agora e quanto pede decisão, por categoria;
- mostra **o que pesa** com treemap e lista navegável por pastas, mais os arquivos grandes (500 MB ou mais);
- lista **categorias de limpeza**: Sistema, Gráficos/shaders, Navegadores, Apps, Dev, Jogos (Steam) e Downloads. Cada item diz o que é, o tamanho, o risco e o que acontece depois;
- **limpa só depois de confirmar**:
  - por padrão vai para a Lixeira;
  - apagar de vez só existe para itens regeneráveis;
  - itens de admin passam pelo UAC, com um script fixo visível antes;
  - jogos, Docker/WSL e arquivos grandes são guiados: o app abre a Steam ou o Explorer, ou mostra os passos.

## Fora do escopo
- Linux e macOS (a arquitetura deixa a porta aberta).
- Leitura da MFT, que exige admin.
- Inglês na interface (as strings ficam prontas para tradução).
- Mover jogos pelo próprio app.
- Agendamento.

## Decisões da pessoa (2026-11-14)
- Nome: folga.
- Visual: ferramenta sóbria, tema do sistema com botão para alternar.
- Idioma: pt-BR primeiro.
- Lixeira: padrão, com apagar de vez para os regeneráveis.
- Categorias ausentes ficam ocultas, com a linha "Verificado: …".
- "Revisar e limpar itens seguros" já vem com os itens de risco baixo marcados.

# SyncBOARD — Fluxo v2 / TC496

Assinatura aprovada por Felipe em 14/10/2026: grafia exata SyncBOARD, sem sufixo NT.

## Identidade preservada
- Cubo modular isométrico, geometria e cores da identidade existente.
- Texto Liberation Sans Bold convertido em curvas, independente de fontes instaladas.
- Paleta: estrutura/texto #111827; topo #D6F46A; face esquerda #244FDB; face direita #F5F7FA.
- Os caminhos de “Sync” são os mesmos da marca anterior. “BOARD” usa a mesma fonte da proposta aprovada.

## Arquivos e aplicação
- logo-primary-light.svg: assinatura colorida com texto navy para fundo claro.
- logo-primary-dark.svg: assinatura colorida com texto claro para fundo escuro.
- logo-primary-mono-light.svg / logo-primary-mono-dark.svg: uma cor, com juntas transparentes.
- mark-primary.svg / mark-primary-light.svg: cubo completo, sem alteração geométrica.
- mark-primary-mono.svg / mark-primary-mono-dark.svg: cubo completo em uma cor.
- mark-small.svg / favicon.svg: símbolo simplificado para 16–24 px.
- mark-small-mono.svg / mark-small-mono-dark.svg: símbolo simplificado em uma cor.
- brand-tokens.json: tokens de interface preservados; metadados da assinatura atualizados.
- manifest.json: hashes SHA-256 dos arquivos atuais. A origem TC443 permanece como proveniência histórica.

Não usar o antigo sufixo isolado. O arquivo nt-custom.svg foi retirado do kit ativo.
A animação do cubo, o favicon e os símbolos continuam com a geometria anterior; somente os títulos acessíveis dos SVGs foram alinhados à marca atual.

## Escala e manutenção
Preservar a proporção 413.617 × 96 das assinaturas. A interface mantém as larguras responsivas existentes; a altura do login acompanha a proporção original.
Usar o símbolo simplificado abaixo de 32 px. Não distorcer, girar ou adicionar sombras. Manter área livre externa mínima de 12 unidades em relação ao símbolo 96 × 96.

Após alterar arquivos da marca ou CSS do login, atualizar os hashes e executar python scripts/embed_login_assets.py. O login público incorpora os SVGs para não depender de rotas protegidas.

TC496 altera a apresentação da marca. Nomes de workspace/projetos, dados, IDs, autenticação e APIs estão fora deste escopo.

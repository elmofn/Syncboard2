# TC496 — Aplicação do logotipo SyncBOARD

## Escopo

Aplicar a assinatura aprovada por Felipe em 14/10/2026: SyncBOARD, sem o sufixo NT, preservando cubo, paleta e tipografia da proposta. Implementação local; publicação e homologação não realizadas por esta alteração.

## Inventário e aplicação

| Local | Alteração |
| --- | --- |
| 4 assinaturas em app/assets/brand-v2/logo-primary-*.svg | Novos glifos BOARD e retirada do sufixo; versões clara/escura idênticas aos arquivos aprovados. Monocromáticas usam os mesmos glifos com o cubo original correspondente. |
| 8 símbolos/favicon | Somente title e aria-label passam a SyncBOARD; polígonos, cores e viewBox intactos. |
| app/index.html | Marca da sidebar, topo mobile claro/escuro, alt/aria, título do navegador, loader e eyebrow. |
| app/login.html | Marca desktop e mobile, textos do produto, favicon e 3 instâncias de logos embutidas; recursos públicos continuam autossuficientes. |
| app/css/login-v2.css | Altura automática nas duas regras de logo para manter a proporção 413.617 × 96. Larguras e breakpoints preservados. |
| app/ui-v2*.html | Logos, alt/aria e apresentação do produto nas três páginas de prévia/componentes. |
| app/js/fidelity-v2.js | Texto da marca no cabeçalho mantido pelo renderizador. |
| app/js/main.js e app/js/ui.js | Apenas strings de apresentação do nome do produto em acesso/carregamento e usuários. Nenhuma alteração de fluxo ou lógica. |
| app/css/fluxo-v2.css | Comentário de identidade alinhado; mesma cópia regenerada no login. |
| Kit da marca | README, metadados e hashes atualizados. Arquivo isolado nt-custom.svg retirado do kit ativo; não havia referência na aplicação. |

## Limite com TC498

Os blocos seguintes permanecem byte a byte iguais à base, cobertos por hashes no teste:

- app/index.html, bloco fidelity-context: workspace SyncBoard NT, emblema NT e título Board em SyncBoard NT.
- app/ui-v2-fidelity-preview.html, bloco fidelity-workspace: mesmo nome e emblema.

Evidência: esses valores aparecem explicitamente em campos “Workspace”, “Workspace atual” e “Board em…”. Ainda que o HTML seja estático, são apresentados como nome do contexto, por isso sua renomeação não foi incluída na tarefa de logo. O controlador context-selector.js documenta que é uma apresentação do contexto atual, sem carregamento ou persistência.

Nenhum nome de projeto, tarefa, dado, ID, API, autenticação, permissões ou workflow de publicação foi alterado. Strings de projetos em dados/fixtures e documentos históricos permanecem intactas. A animação do cubo permanece intacta.

## Verificação

- python tests/check_brand_identity.py: aprovado.
- python tests/check_login_assets.py: aprovado.
- python scripts/embed_login_assets.py --check: aprovado.
- python tests/check_shell_v2.py --isolation-only: aprovado.
- python tests/check_ui_v2.py --foundation-only: aprovado.
- Sintaxe de todos os módulos JavaScript do frontend: aprovada pelas verificações acima.
- Validação final sobre 67dd868b5ef3d354010f0bdf9d9e2a3d1f4349bb (TC493 → TC492 → TC497 → ajustes TC492): 48/78 scripts check_*.mjs e check_*.py aprovados na base; 49/79 no candidato. As mesmas 30 falhas herdadas, nenhuma nova falha de status.
- python tests/check_loading_caption.py: aprovado após atualizar exclusivamente a expectativa textual para Carregando SyncBOARD…. Todos os outros asserts de TC497 preservados.
- Todos os 261 blobs da base conferem com a árvore Git remota exata; nenhum arquivo de outra entrega foi substituído por versão antiga.

As 30 falhas herdadas se concentram em histórico Git ausente na cópia, snapshots/hashes de etapas antigas e harnesses legados que não processam imports atuais. O agregado não está integralmente aprovado; os logs comparativos completos acompanham a entrega local.

Revisão visual feita nos SVGs finais renderizados localmente em fundos claro/escuro, versões mono, 222/176/147/130 px e favicon/símbolos em 16/24/32/40 px. A evidência não é captura de navegador. Navegação autenticada, SSO e renderização integrada no navegador não foram executados nesta etapa.

## Integração

A integração final foi preparada seletivamente sobre o commit exato 67dd868b5ef3d354010f0bdf9d9e2a3d1f4349bb, que já contém TC493, TC492, TC497 e os ajustes de papéis/datas TC492. O delta final tem os 29 caminhos originais mais a atualização de uma expectativa de tests/check_loading_caption.py. A classe fidelity-sr-only das duas entradas permanece.

Registro histórico da rodada de 14/10: o patch daquela rodada era TC496-on-67dd868b.patch. Na retomada atual, usar somente TC496-on-102bcf1.patch, preparado sobre 102bcf1b40175d5feb80d84dc8b99009e57229d3. Não substituir arquivos por versões da cópia inicial. Se main avançar, recompor seletivamente e repetir os testes e a revisão antes de publicar. A preparação local não é publicação nem homologação.

O achado R1 da revisão independente foi resolvido pela mudança da expectativa antiga do loader para a marca aprovada, sem relaxar asserts de acessibilidade, assets ou redução de movimento. Logo, login e loader passaram novamente na composição final.

## Rebase final após os ajustes TC492

Base 67dd868b5ef3d354010f0bdf9d9e2a3d1f4349bb, árvore 48e6a89e18dfbb71391c1c1bf2d52f8a08ff14f5. Os cinco arquivos corrigidos por essa publicação (CSS da tarefa, proveniência, documentação e dois testes TC492) permanecem byte a byte idênticos. TC499 não está incluída nesta base nem neste delta. A árvore anterior incerta foi consultada por SHA esperado e não estava disponível no repositório; nenhum commit/ref da tentativa anterior foi usado.

## Retomada de publicação — 15/10/2026

Delta recomposto seletivamente sobre main 102bcf1b40175d5feb80d84dc8b99009e57229d3, já contendo TC499. Os 270 blobs da base foram verificados contra a árvore remota. A lógica de encaminhamento e orientação de continuidade foi preservada. Os resultados históricos acima são da rodada anterior; a rodada atual acompanha o pacote de evidências. Renomear o projeto (TC498) permanece fora do escopo.

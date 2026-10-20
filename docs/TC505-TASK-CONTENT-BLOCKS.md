# TC505 — três blocos de conteúdo da tarefa

## Resultado

A janela de detalhes mantém sua identidade, título, header, footer, sidebar/resumo, fluxo de pessoas e ações. Sua área principal passa a ter três blocos:

1. **Descrição da Tarefa:** o campo `description` já existente.
2. **Atualização de Progresso:** percentual atual ao lado do título e conteúdo do campo existente `missingToComplete`. Com progresso zero (incluindo valor ausente tratado como 0%), exibe exatamente **Sem atualização até o momento**. Com progresso conhecido diferente de zero e campo vazio, mantém o fallback explícito **Pendência não informada.** O percentual do resumo continua usando o mesmo modelo.
3. **Orientação de Continuidade:** aparece somente quando existe orientação persistida no novo campo `continuityInstructions`, gravado pelo encaminhamento. Exibe a orientação mais recente, em texto literal e preservando linhas.

Os estilos são restritos aos blocos dentro de `#taskHistoryModal`, com superfícies/acento próprios para light/dark, texto que quebra e título/percentual flexíveis. A folha de estilos não altera os breakpoints, as colunas ou os controles existentes. Index, preview e fragmento ficam consistentes.

## Persistência e segurança

Armazenamento confirmado no código: Azure Cosmos DB, banco `TasksDB`, container `Tasks`. A tarefa é um documento NoSQL. O novo campo opcional `continuityInstructions` é uma string de texto simples, sem SQL, coluna relacional, tabela ou migração estrutural.

- O contrato transitório `forwardInstructions` da TC499 é mantido. Após autenticar o homologador designado/cadastrado, validar a etapa, o ETag, a orientação e o destinatário, `decisionUpdate` coloca o texto validado/trimado em `continuityInstructions`.
- O handler substitui o documento com a proteção `IfMatch` existente. Campo, responsáveis, status e histórico são persistidos na mesma escrita. Escrita concorrente perdedora não emite sucesso.
- `continuityInstructions` é protegido de saves genéricos, inclusive formas completas ou tentativas de apagar/forjar. A whitelist de criação também não aceita o campo. Aprovar, reprovar e recuperar homologador não permitem substituí-lo.
- Um novo encaminhamento substitui apenas a orientação atual. O histórico escapado da TC499 preserva as orientações anteriores e permanece separado do campo de pendências/progresso.
- O frontend usa `textContent`. Não interpreta HTML da orientação e não tenta extrair dados do histórico.
- Respostas do endpoint e eventos SignalR usam o documento salvo, incluindo o novo campo. Reads existentes retornam o documento completo; não foi acrescentado serviço externo ou acesso.

## Compatibilidade

Tarefas encaminhadas antes desta versão não têm `continuityInstructions`. Nessas tarefas, o bloco permanece oculto, sem erro ou inferência; o encaminhamento anterior continua consultável no Histórico. O próximo encaminhamento feito com a API nova preenche o campo normalmente. Não foi feito backfill ou alteração de dados em produção.

Uma orientação já salva permanece visível durante as etapas seguintes; não é removida só porque a tarefa sai de Andamento. O próximo encaminhamento passa a ser sua nova origem. Frontend e API devem ser publicados juntos: só o frontend novo com API antiga não cria o novo campo; a ausência é tolerada.

## Verificação desta entrega

Base: `6232ee595c7e9cbf56ab0b17abb878ce186a1871`, HEAD remoto consultado em 16/10/2026. Todos os blobs da cópia de base foram conferidos contra a árvore remota antes de editar.

- `node tests/check_task_continuity_api.mjs`: persistência pelo handler real com Cosmos/serviços externos isolados; encaminhamento novo e repetido, histórico, criação/saves genéricos, decisões, atores, destinatários, duplicação, ETag e concorrência.
- `node tests/check_task_content_sections.mjs`: adaptador real em DOM mínimo; percentual/zero, conteúdo existente, orientação condicional, ausência legada, multiline/HTML literal, payload salvo pelo backend, troca de tarefa, reabertura, abas e cancelamento/retorno do editor de progresso.
- Suíte comparativa `tests/check_*`: **56/86** scripts passam na base; **58/88** no candidato. As mesmas 30 verificações falham/bloqueiam nos dois, em geral por contratos/fixtures históricos ou histórico Git ausente. Nenhuma falha nova; os dois testes adicionados passam.
- Sintaxe de **55** arquivos JavaScript de aplicação/API aprovada.
- Comparação DOM dos três HTMLs: header, sidebar e footer idênticos à base, sem IDs duplicados.
- Revisão independente de código/contratos: nenhum defeito bloqueante identificado; confirmação dos limites de autorização, concorrência e conteúdo seguro.

Não é uma alegação de suíte inteira verde. Não houve teste de pixels/responsividade, foco nativo, Cosmos real ou atualização real de uma tarefa em navegador nesta etapa. O checklist abaixo é a homologação restante. Nenhuma publicação foi realizada nesta implementação.

## Roteiro de QA/homologação

Usar ambiente autorizado e dados de teste. O encaminhamento altera a tarefa; não utilizar tarefa de produção real sem autorização correspondente.

1. Em light e dark, abrir detalhe nos tamanhos desktop (1440/1024px), limite da sidebar (881/880px) e mobile (393/320px). Conferir três superfícies, texto/cor/contraste, título com percentual, quebra de conteúdo longo, scroll e ausência de overflow horizontal. Comparar header, footer, sidebar, logo e controles com a base.
2. Abrir tarefa sem encaminhamento, com 0%. Deve mostrar Descrição e Atualização de Progresso, o percentual 0% e a mensagem exata; Continuidade oculto. Mesmo que haja texto antigo em `missingToComplete`, o texto de zero prevalece.
3. Atualizar progresso pelo formulário existente para um valor intermediário com texto multilinha. Salvar, reabrir e recarregar. O percentual do bloco e do resumo deve coincidir; texto vem do campo existente. Cancelar outra edição não deve persistir nada.
4. Conferir tarefa em 100% com campo de pendências vazio: exibir 100% e fallback de pendência não informada, sem afirmar aprovação/publicação.
5. Como homologador designado, encaminhar uma tarefa de teste em Homologação para a mesma pessoa e depois, em novo ciclo, outra pessoa. Informar orientações distintas. Após recarregar, a orientação atual deve ser a última; o Histórico deve manter ambas, sem nova reprovação. Progresso preservado, responsável único e regras TC499 intactas.
6. Enviar texto como `<script>`, aspas, `&`, várias linhas e uma palavra longa. No bloco, deve aparecer literalmente e não executar; no histórico, deve permanecer escapado.
7. Abrir uma tarefa com orientação; fechar; abrir outra sem orientação; retornar à primeira. Não pode vazar texto, visibilidade ou aba selecionada. Repetir Fechar/Cancelar e editor de progresso; confirmar que comentários, anexos, Histórico e ações continuam operantes.
8. Conferir encaminhamento legado sem campo novo: bloco oculto, histórico preservado, nenhum texto inferido. Um novo encaminhamento deve preencher o campo.
9. Tentar decisão sem ser homologador, com snapshot antigo e dois envios concorrentes. Manter rejeições/409 existentes e apenas uma escrita vencedora. Não aceitar orientação enviada num save genérico.
10. Após publicação autorizada, verificar o commit remoto, CI/deploy correspondente e recarregar abas antigas. Homologação/aprovação/publicação/conclusão são passos separados.

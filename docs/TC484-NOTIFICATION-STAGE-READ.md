# TC484 — Leitura automática por avanço de etapa

## Revisão aprovada em 14/10/2026 — avisos antigos de homologação

A versão inicial foi publicada em `f6fbd4836d180453249f07b34ccc30efb0c2adef`.
Esta revisão acrescenta uma exceção estrita à preservação do legado, autorizada após o relato de TC480/TC486:

- Apenas registros sem `taskStageVersion` e sem `type`, com `message` igual a `Homologação Pendente` e `commentPreview` iniciado pelo texto do produtor automático para o mesmo ID da tarefa.
- O snapshot comprometido da tarefa usado na reconciliação precisa estar em `publication` ou `done`. Fila, Andamento, Parado e Homologação não acionam a exceção. Se houver reabertura concorrente depois de uma aprovação já comprometida, o aviso legado do ciclo superado é lido, enquanto o novo aviso versionado da reabertura permanece não lido.
- O sweep após salvar a tarefa e a consulta autenticada do próprio destinatário aplicam a mesma regra. Tarefas já em Publicação/concluídas não precisam mudar de status para reconciliar na próxima consulta.
- Somente `/isRead` é alterado. ID, texto, destinatário e histórico são preservados; nenhum campo novo, backfill de versão, migração global ou endpoint administrativo foi criado.
- Campos inválidos, tipos explícitos, menções, outros avisos e formatos desconhecidos continuam preservados. Não há classificação por data ou conteúdo aproximado.
- Patch condicional inclui ETag, taskId, ausência da versão/tipo e conteúdo exato. Falhas continuam pendentes para reconciliação posterior, sem afirmar leitura não persistida.
- Isto não implementa a solicitação separada de marcar todas as notificações de todos os usuários.

Evidência local: oito casos da nova exceção falham contra o helper anterior; 59 testes API/UI passam com a revisão (45 anteriores + 14 novos). Cobertura inclui aprovação, tarefa já Publicação/done sem metadados, Parado→done, isolamento do destinatário/tarefa, tipos inválidos, conflitos, retry, idempotência e preservação de conteúdo.
Não foram acessadas notificações da conta de Felipe. Os tipos exatos dos avisos reclamados não foram confirmados, portanto não se afirma que esta exceção resolva todos os avisos dele.

## Histórico da entrega inicial (evidências locais à época)

Base verificada: `6300684d152253420b9279ecdba7e585b15af972` (main).
O candidato contém somente esta melhoria; não incorpora os candidatos locais TC480 ou TC483.
Não houve push, PR, deploy, migração, backfill nem acesso a notificações/banco de produção.

## Comportamento

- Avanço explícito segue Fila → Andamento → Homologação → Publicação → Concluída, permitindo saltos para frente entre essas etapas.
- `done` é o estado usado pelo sistema para conclusão/arquivo. Entrar em `done` também encerra notificações versionadas quando a origem é Parado.
- Reordenar, editar sem mudar a etapa, ajustar apenas progresso, retornar/reprovar/encaminhar e restaurar não são avanço.
- Entrar ou sair de Parado não é classificado como avanço, exceto a conclusão explícita em `done`. O sistema não possui origem ativa estruturada para distinguir Andamento → Parado → Homologação de Publicação → Parado → Homologação. Os avisos são preservados nesses casos.
- Um avanço marca `isRead=true` somente nos registros não lidos da mesma tarefa cuja versão de origem já foi superada. O registro, texto e destinatário permanecem intactos. Isso vale para cada destinatário legítimo do aviso, não apenas para quem moveu o card.
- A notificação nova de Homologação e menções criadas na etapa atual permanecem não lidas.
- Avisos legados sem versão de origem não são alterados por data. A exceção estrita de homologação aprovada em 14/10 está descrita acima.

## Três campos aprovados

| Documento | Campo | Contrato |
| --- | --- | --- |
| Tasks | `notificationStageVersion` | Inteiro não negativo; começa em 0 e aumenta em cada mudança real de status, inclusive retorno/pausa/restauração, diferenciando ciclos repetidos |
| Tasks | `notificationsReadThroughStage` | Inteiro; -1 significa nenhum avanço registrado. Num avanço, recebe a versão anterior à mudança. Não regride em dados válidos |
| Notifications | `taskStageVersion` | Inteiro copiado do snapshot da tarefa que originou o aviso, nunca da tarefa lida posteriormente |

Os campos são controlados pelo servidor. Saves completos/valores enviados pelo cliente não podem definir ou regredir o marco. Metadados persistidos inválidos não são renumerados por suposição.

Não é necessária migração em lote: tarefas existentes sem versão são tratadas como versão inicial 0 ao produzir novos avisos. O próximo save/avanço grava o vínculo. A criação HTTP inicializa 0/-1; a criação existente pelo Discord continua compatível com a inicialização preguiçosa. Nenhum aviso sem vínculo é retroativamente rotulado.

## Por que o histórico antigo não resolve o legado

O `history` contém descrições HTML do destino e timestamps. A notificação não contém ID do comentário nem etapa de origem, e seu `createdAt` é calculado depois que o comentário foi salvo. O teste reproduz uma menção salva em Andamento cujo aviso só é criado após a entrada em Homologação, com `createdAt` posterior ao avanço. Comparar datas confundiria esse aviso antigo com uma menção atual. Comentários repetidos/editados/deletados tornam a associação por texto igualmente ambígua.

## Rotas e concorrência

- `updateTask`: valida o snapshot de origem, grava status/versão/marco no mesmo replace condicionado ao ETag; só depois tenta reconciliar avisos e criar a notificação de homologador.
- `addComment`: copia a versão do replace que efetivamente salvou o comentário; depois da criação do aviso, relê a tarefa e reconcilia um eventual avanço concorrente.
- `dismissAlert`: vincula a notificação criada pelo clique “Recebido, vou olhar” à etapa daquele clique. `pendingAlerts` é outro mecanismo, sem vínculo de etapa aprovado, e não foi transformado em Notifications ou limpo automaticamente.
- `getNotifications`: mantém a consulta do destinatário autenticado; reconcilia somente seus registros versionados, agrupando leituras por tarefa e limitando concorrência a oito operações. Responde com `Cache-Control: no-store`.
- `updateOrder` continua alterando somente ordem, sem marcar avisos. Os outros escritores de Tasks preservam os campos de versão pelo contrato de ETag existente; remoção de tarefa não é conclusão/arquivo e não apaga notificações.
- `markNotificationRead` continua disponível. A leitura automática somente altera `/isRead` para `true` e nunca grava `false`.

A marcação usa Patch de `/isRead` com condição explícita de ETag, taskId, versão e não lida, além do IfMatch. Conflitos são relidos e repetidos de maneira limitada. Não há replace completo de notificação, exclusão ou “marcar tudo” global. Condições usam literais JSON escapados.

Tasks e Notifications estão em partições/containers distintos, sem transação conjunta. O marco sobrevive a falhas depois do commit da tarefa. Uma falha no sweep não devolve falso erro de salvamento para induzir a repetir a mudança; fica registrada no log e a próxima criação/leitura de notificações tenta reconciliar. Em caso de falha de Patch, a resposta não afirma que uma leitura foi persistida.

A convergência é eventual: erro continuado de Cosmos, leitura de réplica atrasada ou interrupção antes do sweep pode adiar a marcação até a próxima leitura/reconexão/foco. Este patch não instala worker de background nem garante prazo de convergência quando não há novas requisições.

## Mudança necessária no contrato de atualização

Mudanças genéricas de status agora exigem `expectedStatus` e `expectedEtag` correspondentes ao snapshot que o usuário viu. Sem ambos, ou se estiverem antigos, `updateTask` responde 409 e não muda tarefa nem avisos. Saves genéricos que fornecem snapshot também são verificados. A autoridade e as validações específicas de homologação permanecem.

Motivo: antes, um formulário aberto em Andamento podia reenviar esse status durante uma simples edição de título depois de outra pessoa devolver a tarefa à Fila. Isso criaria um falso avanço e leria avisos sem intenção. A regressão foi reproduzida RED e corrigida.

Chamadores atualizados:
1. Formulário de edição: snapshot de abertura.
2. Arrastar entre colunas: status/ETag anteriores à mutação otimista; usa a resposta confirmada no estado local.
3. Concluir/publicar: snapshot do card selecionado.
4. Restaurar: snapshot da consulta do arquivo, mantido separado das tarefas ativas.
5. Entrada, recuperação e decisões de homologação já enviavam snapshot.
6. Atualização apenas de percentual não envia status e não gera avanço.

Abas antigas e integrações externas que enviem somente `{status: ...}` precisam recarregar/atualizar seu chamador para enviar o snapshot. A UI orienta recarregar em 409. Um drag rejeitado desfaz somente seu próprio objeto otimista; não sobrescreve um evento SignalR mais novo. A alteração não promete rollback visual completo para falhas de rede ambíguas ou falhas parciais da operação de reordenação.

O cliente também descarta respostas antigas de leitura de notificações, para não repintar como não lido um resultado mais novo, e relê na atualização de tarefa, reconexão e retorno de foco.

## Evidência local

- RED inicial: 3 falhas esperadas e 7 controles passando, antes de alterar aplicação: entrada em Homologação, arquivo e criação atrasada de menção.
- RED adicional: formulário com snapshot antigo gerava avanço indevido; agora retorna 409.
- GREEN: 45 casos novos, sendo 39 API/modelo e 6 UI/controller.
- Cobertura: todos os produtores, criação, avanço/aprovação/arquivo, pausa e retorno, ciclos repetidos, restauração, versões legadas/inválidas, outros destinatários e tarefas, aviso atual, ETag concorrente, leitura manual, falhas de query/Patch, resposta de task perdida após commit, réplica atrasada, post-create e notificação tardia, snapshot forjado/ausente/antigo, cache, resposta UI fora de ordem e drag409 com evento mais novo.
- Varredura comparativa dos 64 scripts existentes: base 35 passando / 29 falhando; candidato 35 passando / mesmas 29 falhando. Com os 2 scripts novos: 37 passando / 29 falhando. Nenhuma falha nova.
- 49 arquivos JavaScript passaram na verificação de sintaxe. `git diff --check` limpo.
- Duas revisões independentes sem bloqueio funcional restante identificado.

Comandos principais:

```sh
node --test tests/check_notification_progress.mjs tests/check_notification_progress_ui.mjs
node tests/check_homologation_api.mjs
node tests/check_required_homologator_api.mjs
node tests/check_admin_homologation_responsible_api.mjs
node tests/check_admin_homologation_responsible_ui.mjs
node tests/check_kanban_flow_v2.mjs
node tests/check_archive_actions_v2.mjs
node tests/check_people_v2.mjs
git diff --check
```

Os testes existentes foram adaptados somente para carregar o helper/contador reais, devolver o snapshot/ETag realista e verificar o contrato novo de payload/mensagem. As 29 falhas da base não foram enfraquecidas ou ocultadas. A listagem completa e saídas estão no pacote de evidências.

## Limites e verificação antes de publicação

Toda a execução ocorreu com mocks locais e dados sintéticos, em Node 24.19.0; o projeto declara runtime Node 20.x. Não foram executados Azure Functions/SWA em runtime real, Cosmos/emulador, navegador, SSO ou integração de SignalR. Não houve instalação de dependências nem alteração de lockfile.

O lockfile mantém `@azure/cosmos` 4.4.1. O uso de `patch(body, options)` e do corpo `{condition, operations}` está documentado oficialmente:
- [Item.patch, SDK JavaScript](https://learn.microsoft.com/en-us/javascript/api/@azure/cosmos/item?view=azure-node-latest)
- [PatchRequestBody, SDK JavaScript](https://learn.microsoft.com/en-us/javascript/api/@azure/cosmos/patchrequestbody?view=azure-node-latest)
- [Patch condicional e resposta 412, REST](https://learn.microsoft.com/en-us/rest/api/cosmos-db/patch-a-document)

Isso é verificação de contrato/documentação, não teste do serviço. Antes de publicar, falta validar em ambiente de homologação autorizado a query/indexação, Patch condicional/412 com o SDK travado, isolamento de partições, reconexão e o fluxo visual completo. Nenhuma mudança de índice ou migração é incluída. A publicação depende de autorização própria; aceitação funcional desta entrega não a executa automaticamente.

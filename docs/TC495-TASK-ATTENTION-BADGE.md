# TC495 — Atenção solicitada

Candidata local baseada em main a28949b687c32f9d54eeb7da442194282f90ab4e. Não publicada.

## Comportamento

O selo rosa aparece no card Kanban, detalhe, Home e lista somente para destinatários reconhecidos pelo mecanismo existente. Confirmar o popup mantém o selo. Uma mudança real de status remove os alertas da tarefa; edição, comentário, progresso e salvamento do mesmo status não removem. Voltar a um status anterior não ressuscita alertas. A timeline do Resumo e o Histórico preservam as novas sinalizações, com suas datas registradas.

## Contrato aprovado

- `pendingAlerts`: strings legadas continuam aceitas. Objetos mantêm `targetUser`, `signaledBy`, `timestamp` e podem incluir `acknowledgedAt`, ISO gerado pelo servidor ao confirmar. Todas as ocorrências desse campo no código têm comentário TC495 adjacente.
- `history`: campos existentes `action`, `description`, `timestamp`; novo valor de action `attention_requested`. Nomes interpolados são escapados no servidor. O Resumo usa apenas o tipo e a data, sem inferir identidades da descrição.
- Confirmação repetida não escreve nem cria outra notificação. Re-sinalização explícita substitui o alerta do destinatário e reativa sua condição não recebida, preservando os demais.
- Não há nova coleção, índice ou migração. Alertas já apagados anteriormente não são reconstruídos. Strings legadas confirmadas não recebem data de sinalização inventada. Não há backfill.

## Integridade

Sinalização, confirmação e transição mantêm proteção IfMatch/ETag e resposta409 em conflito. Histórico e alertas são atualizados atomicamente na tarefa. Payload genérico não pode sobrescrever pendingAlerts. O popup envia expectedEtag como precondição opcional da confirmação;409 recarrega e reapresenta o alerta atual sem confirmá-lo automaticamente. A fila revalida o estado carregado antes de abrir. As respostas de sinalização/confirmação releem a tarefa após efeitos assíncronos. SignalR e adoção da resposta HTTP preservam a etapa mais recente, sinais posteriores e o recebimento monotônico de um mesmo sinal. Os mecanismos existentes de identidade, autorização, homologação, proveniência e notificações por etapa permanecem.

## Verificação

- `node tests/check_task_attention.mjs`: destinatários, dados malformados, quatro superfícies e contratos de apresentação.
- `node tests/check_task_attention_lifecycle.mjs`: handlers reais em Cosmos simulado; retenção, reload, idempotência, re-sinalização, status, conflito, payload adulterado, legado, escape e timeline.
- `node tests/check_task_detail_flow.mjs`: regressão do Resumo e das correções TC492.
- Evidência externa à aplicação: `tc495-lifecycle-evidence/lifecycle-ordering.json` cobre SignalR antes da resposta HTTP e após abrir detalhe, com transporte/DOM simulados.
- A suíte completa é comparada ao baseline para distinguir falhas preexistentes. Testes locais não equivalem a homologação visual nem a tráfego real de API/SignalR.

## Limites preservados

SignalR ao vivo atualiza o selo sem abrir um popup novo automaticamente, como antes. A fila é verificada na inicialização. A identidade continua usando os identificadores atuais; esta tarefa não redefine correspondência entre nomes e contas. Browser QA, implantação e homologação continuam etapas separadas.

Clientes com JavaScript antigo em cache devem recarregar após eventual implantação para reconhecer o novo estado de recebimento. A compatibilidade com pedidos antigos sem expectedEtag é preservada, mas esses pedidos não têm a proteção adicional da precondição enviada pelo novo frontend.

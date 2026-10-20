# TC499 — encaminhar para continuidade

## Comportamento

- O homologador designado pode encaminhar uma tarefa em Homologação para qualquer pessoa cadastrada, inclusive o responsável atual ou o próprio homologador.
- O diálogo exige a seleção de uma pessoa e uma orientação de continuidade não vazia.
- A tarefa volta para Andamento. O progresso atual é preservado; o homologador é limpo, como no encaminhamento anterior. Uma nova entrada em Homologação continua exigindo a indicação de homologador.
- A pessoa escolhida passa a ser a única responsável. Quando havia mais de uma, a interface deixa essa substituição explícita.
- O histórico registra “Homologação encaminhada”, o ator autenticado, a pessoa escolhida, a orientação escapada e Andamento. Não registra uma nova reprovação.
- A trilha de atribuições só recebe entrada quando o conjunto de responsáveis muda. Encaminhar para a mesma pessoa continua aparecendo no histórico normal, sem inventar uma troca de responsável.

## Alterações técnicas

O contrato de encaminhamento usa o campo transitório `forwardInstructions`. Na entrega original da TC499, o conteúdo era armazenado somente como texto escapado no histórico já existente. A TC505 mantém esse contrato/histórico e acrescenta a string opcional `continuityInstructions` no documento Cosmos para a apresentação da orientação atual. Não há tabela ou migração relacional. Consulte [TC505 — blocos de conteúdo](TC505-TASK-CONTENT-BLOCKS.md) para segurança, compatibilidade e validação atuais. A API valida a orientação e o destinatário; campos de auditoria enviados pelo cliente não substituem os dados do servidor.

A autorização exclusiva do homologador cadastrado, o estado esperado e a verificação ETag permanecem. Escritas concorrentes perdedoras não geram histórico ou notificações de sucesso. Aprovar e Reprovar não mudaram.

## Validação

- `node tests/check_same_responsible_forward.mjs`: controller e cliente reais, serialização/fetch HTTP localhost e handler real; Cosmos e serviços externos isolados. Cobre responsável atual/outro/homologador, formato legado de responsável, múltiplos responsáveis, orientação vazia/HTML/multilinha, histórico, identidade e ETag.
- Regressões: `check_homologation_api`, `check_homologation_decisions`, `check_homologation_forward_dialog`, `check_forward_detail_close` e `check_notification_progress`.
- Comparação da suíte `check_*` após rebase seletivo em `5d4ed6b8eecfd53a54300623229df16fa6ecdd82`: 50/80 na base e 51/81 no candidato. As mesmas 30 falhas já ocorrem na base, principalmente pela ausência do histórico Git e por fixtures/hashes antigos. Nenhuma falha nova identificada. Os testes TC495 de atenção e ciclo de vida, TC492 de detalhe e TC497 de legenda do loader passaram sem alteração. Sintaxe de 54 arquivos JavaScript validada.
- O teste `browser_same_responsible_forward.mjs` está preparado para navegador nativo com dados sintéticos. Não foi executado nesta revisão, por restrição explícita de não usar navegador. Nenhuma validação visual, de foco nativo ou de layout foi concluída aqui.

## Limites e publicação

O repositório não contém o relatório de performance citado na tarefa. A garantia testada é que o encaminhamento não acrescenta evento de reprovação. Um relatório externo que classifique toda transição Homologação → Andamento como reprovação precisa reconhecer o tipo de evento; esse relatório não foi validado.

Este pacote foi recomposto seletivamente sobre `5d4ed6b8eecfd53a54300623229df16fa6ecdd82`, preservando todas as mudanças recentes de main, inclusive TC495. A base teve seus 266 blobs verificados. O delta original aplicou sem conflito; apenas esta documentação foi atualizada em relação ao candidato anterior. É local e não foi publicado. Frontend e API precisam ser publicados juntos, após autorização, e abas antigas recarregadas: clientes antigos não enviam a orientação obrigatória. Testar em homologação o diálogo nativo, a continuidade para o mesmo responsável e o relatório real antes de aprovar ou concluir a tarefa.

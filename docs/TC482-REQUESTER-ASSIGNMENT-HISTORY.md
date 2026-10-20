# TC482 — Solicitante e sequência de responsáveis

## Entrega

- Solicitante entre Prioridade e Responsáveis no detalhe, com origem visível.
- Rodapé dos cards: solicitante seguido dos grupos de responsáveis ao longo do tempo. Pessoas simultâneas continuam agrupadas; A → B → A preservado.
- Avatares por e-mail, iniciais de fallback, fotos inválidas removidas, rótulos acessíveis por teclado/toque, rolagem horizontal em sequências extensas. Comentários, prazo, progresso, status e homologador preservados.

## Ajuste após homologação — 14/10/2026

Solicitante de novas tarefas web é a conta autenticada que está criando a tarefa. Não há seleção, confirmação ou referência de solicitante no formulário. O servidor ignora integralmente requester e requesterEvidenceConfirmed enviados por clientes antigos ou manipulados.

Nome vem do perfil cadastrado da conta autenticada; perfil ausente usa o próprio e-mail autenticado. Falha de consulta ao serviço não salva a tarefa parcialmente. recordedByEmail e recordedAt continuam definidos no servidor. O valor técnico existente source:self_declared é preservado para novas criações, sem novo enum/campo; apresentação usa “Registrado na criação”.

Nenhuma migração/backfill: requester existente, inclusive source:explicit_request e sua referência antiga, permanece intacto em edições. O histórico de responsáveis e suas regras de concorrência permanecem iguais. A integração Discord sem identidade autenticada vinculada continua requester:null e assignmentHistory:[], sem inventar equivalência com usuário web.

## Contrato e critérios

Duas estruturas existentes: requester e assignmentHistory. Nenhum campo adicional.

requester: email, name, source, recordedByEmail, recordedAt, evidenceRef.

- Criação web deriva a identidade exclusivamente do principal autenticado.
- Solicitante é imutável no update genérico; dados antigos ausentes continuam “Não registrado”.
- Indicações explícitas antigas permanecem visíveis com sua origem, sem reclassificação.

assignmentHistory: eventos append-only {at, actorEmail, from, to}, com snapshots [{email,name}].

- Atualização comum, edição administrativa e encaminhamento passam pela mesma captura antes da escrita condicional IfMatch/ETag. Conflito não publica evento nem notificação.
- Evento inicial tem from:[], com timestamp idêntico a createdAt; origem legada desconhecida tem from:null. A primeira mudança de legado com responsável observado registra apenas esse antes/depois, sem reconstruir passado.
- Reordenação/nome/foto sem mudança do conjunto de e-mails não adiciona evento.
- Dados legados ausentes permanecem ausentes. UI exige marcador de criação consistente antes de representar cadeia como completa; lacunas quebram a sequência visual.

## Evidência local da primeira entrega

Base confirmada: f6fbd4836d180453249f07b34ccc30efb0c2adef.

- 33 casos novos em tests/check_task_provenance.mjs.
- 52 arquivos JavaScript passaram node --check.
- Suíte completa: base 42 checks aprovados/30 falhas históricas; candidato 43 aprovados/mesmas 30 falhas, sem regressão nova.
- Fixtures extraídas de controladores receberam os novos helpers reais e o principal de autenticação com a role exigida; assertions anteriores preservadas.
- Revisão independente: sintaxe inicial, identificação de cadeia legada vazia, lacunas duplicadas, normalização de strings, erro de criação e acesso via teclado/toque corrigidos.
- Testes usam VM/DOM sintéticos e Cosmos mockado. Não substituem QA online visual/serviços reais.

## Limite das referências declaradas legadas

A indicação explícita antiga fica atribuída ao registrador autenticado. Referências históricas não são certificação automática de autoria ou integridade do texto. A confirmação consciente do registrador e a origem exibida fazem parte deste contrato; a autoidentificação é validada diretamente contra a conta autenticada.

## Publicação e rollback desta correção

Fluxo main → Azure Static Web Apps. Base e ponto de rollback desta correção: c9a550442a467e17beaef4b4350524bc5537f2b4. Se houver commits posteriores, restaurar seletivamente somente os arquivos desta correção, preservando TC484, TC488 e entregas posteriores. Não restaurar o predecessor da primeira entrega TC482 nem apagar campos já capturados. Sem migração ou alteração de infraestrutura.

Entrega destinada à Homologação por Felipe. A implementação não aprova, conclui nem arquiva a tarefa. QA online e resultado do deploy registrados na tarefa.

## Evidência da correção

Base integrada confirmada: c9a550442a467e17beaef4b4350524bc5537f2b4, preservando TC484 e TC488. Testes prospectivos cobrem payload omitido/nulo/manipulado, identidade autenticada, perfil ausente, falha de serviço, identidade via claim, Cashia como criadora, preservação de legado e ausência de controles editáveis. Resultados completos e revisão registrados com a entrega. Publicação depende da revisão coordenada.

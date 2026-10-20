# TC483 — Homologador opcional na criação

Base: `techtravelcash/syncboard`, commit `6300684d152253420b9279ecdba7e585b15af972`.

## Entrega

- Campo nativo de seleção “Homologador (opcional)” no cadastro, nas duas entradas HTML e no fragmento do formulário. Começa em “Definir depois”, sem escolha automática do criador ou responsável.
- A seleção usa o e-mail como identidade e mostra nome/e-mail. Nomes iguais não confundem a seleção; entradas sem e-mail válido e e-mails duplicados não viram opções.
- O endpoint de criação aceita a ausência do campo. Quando preenchido, valida o cadastro no contêiner `Users` existente em `TasksDB` e persiste o perfil canônico, ignorando nomes, cargos ou supostas aprovações enviados pelo cliente. Não há migração ou novo modelo de banco.
- O homologador indicado fica visível no detalhe desde Fila e é preservado em edições normais e na passagem para Andamento. O campo de cadastro não permite reatribuição durante uma edição.
- Ao enviar para Homologação, a seleção anterior é reapresentada somente se ainda estiver cadastrada. Continua sendo necessária a confirmação explícita, com as validações existentes de estado e ETag. O backend não herda silenciosamente uma indicação antiga.
- Cancelar, reabrir ou interromper o cadastro durante upload não pode iniciar uma gravação posterior com a seleção da sessão anterior. Uma requisição já enviada ao servidor não é cancelada por fechar o formulário.
- Campo e escolha são mantidos quando a gravação falha. O erro de seleção inválida permite escolher outra pessoa ou deixar a definição para depois.

## Limites preservados

- Novas tarefas continuam sendo criadas em Fila.
- `api/updateTask`, as regras de decisão, as permissões administrativas, a coordenação de remoção do homologador e a proteção por ETag não foram alteradas.
- A obrigatoriedade já existente para outras entradas em Homologação não foi relaxada. A TC473 não foi reaberta.
- Indicar uma pessoa não aprova a tarefa, não publica software e não gera uma notificação de homologação antes da entrada nessa etapa.
- A aprovação, reprovação e o encaminhamento continuam usando as ações e identidades existentes.

## Indicação não significa aprovação

O fluxo legado permite alterações diretas de Fila/Andamento para Publicação fora das ações de homologação. Esta entrega não modifica esse fluxo nem representa uma revisão de segurança ponta a ponta.

Para que a nova pré-indicação não pareça uma aprovação inexistente, cards e listas exibem o rótulo neutro “Homologador”; o detalhe mostra “Pendente” em Homologação e “Definido” nas demais etapas. O status Publicação, o histórico de decisões efetivas e o feedback após uma aprovação real são preservados. Não se usa uma heurística sobre texto de histórico para inventar um estado de aprovação.

## Validação

Executado em Node.js `v24.19.0`; o runtime alvo Azure Node 20 não foi iniciado neste ambiente.

Quatro regressões novas:

1. `node tests/check_optional_homologator_creation_api.mjs`: handler real com mocks; campo vazio, seleção válida/canônica, identidade forjada, e-mail inválido/removido, criação somente em Fila, autenticação, falhas de leitura/gravação, retorno HTTP e SignalR.
2. `node tests/check_optional_homologator_creation_ui.mjs`: callbacks reais com DOM/API sintéticos; campos acessíveis, seleção, cancelamento, reabertura, retenção após erro, clique repetido, interrupção de upload, edição sem apagar a indicação, confirmação e cancelamento do diálogo obrigatório.
3. `node tests/check_optional_homologator_lifecycle.mjs`: ambos os handlers reais com armazenamento em memória; criação com/sem indicação → Andamento → Homologação; seleção explícita, ETag, reserva, notificação única, bloqueio de aprovação pelo criador não designado, reprovação, aprovação real com auditoria e pessoa removida. Inclui a caracterização explícita do fluxo legado direto para Publicação.
4. `node tests/check_optional_homologator_presentation.mjs`: seções reais dos renderizadores; indicação não vira “Aprovado/Homologado por” pelo status, textos literais são escapados, modelo/histórico não são alterados.

Os testes de API e UI foram escritos antes da implementação e falharam na base pelos defeitos esperados; passaram após a alteração. O teste de apresentação também foi registrado em vermelho antes da correção dos rótulos.

Comparação de todos os `tests/check_*.mjs` e `tests/check_*.py`, sem opções adicionais, entre checkout limpo da base e candidato:

- Base: 64 verificações, 35 passaram e 29 falharam.
- Candidato: 68 verificações, 39 passaram e as mesmas 29 falharam.
- Nenhuma verificação que passava na base passou a falhar no candidato.
- As 29 falhas incluem contratos históricos de versões anteriores e fixtures desatualizadas. Não foram suprimidas, e a comparação não equivale a aprovação integral da suíte.
- `git diff --check` passou; análise sintática dos 48 arquivos JavaScript de `app/js` e `api` passou.
- As fixtures legadas de criação, formulário e edição administrativa receberam somente o suporte necessário ao novo helper/campo opcional. As regras de decisão e de transição continuam cobertas pelos testes existentes.

## Verificação ainda necessária

Esta entrega é um patch local testado com serviços simulados. Não houve chamadas ao Cosmos real, alterações de tarefas reais para testar decisões, CI, push, PR, merge ou deploy. Não há evidência de geometria, foco físico ou aparência em navegador nativo; o candidato ainda precisa de QA visual em ambiente autorizado e dos testes do ambiente de publicação.

Checklist de QA após disponibilização autorizada:

- Criar tarefa sem homologador e com pessoa escolhida; reabrir o detalhe e conferir a persistência.
- Repetir em tela estreita, teclado e temas claro/escuro.
- Cancelar/reabrir cadastro, provocar erro controlado e conferir a retenção da seleção.
- Editar título/descrição e passar para Andamento sem perder a indicação.
- Entrar em Homologação com e sem pré-indicação; confirmar que cancelar não move a tarefa e que a pessoa é obrigatória ao confirmar.
- Usar uma seleção que foi removida e um snapshot desatualizado; conferir bloqueio e ausência de gravação duplicada.
- Verificar os rótulos neutros antes da homologação e em Publicação, mantendo o histórico de aprovação real.

## Aplicação

O pacote contém o patch completo e os resultados comparativos. Verifique a base com `git apply --check` antes de aplicar. A aplicação e publicação dependem da autorização correspondente. O patch não contém alterações da TC480; os checkouts foram mantidos separados.

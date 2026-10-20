# TC492 — Resumo e Fluxo no detalhe da tarefa

## Ajuste solicitado após homologação — 14/10/2026, 18:47 UTC

Status deste ajuste: somente local, sem publicação. Base remota verificada: 8f95c6e2841ed7e0e4fe8b495b4ce185b30dffc1, preservando TC493 e TC497. TC496 não incluída.

Pedido de Felipe aplicado à apresentação de cada pessoa:

- Nome na primeira linha; função e data/hora registradas logo abaixo.
- Funções: Solicitante, Responsável principal (primeiro do grupo atual), Responsável e Homologador.
- Sem o rótulo visual Atuais; o contorno azul e a semântica acessível do grupo atual permanecem.
- Histórico, grupos simultâneos, retornos e lacunas continuam iguais. Nenhuma pessoa é acrescentada ou removida nos dados.
- Datas do solicitante vêm exclusivamente de requester.recordedAt; datas dos grupos vêm de assignmentHistory.at. O instante pertence ao registro do solicitante ou à transição do grupo, não é uma inferência de quando a pessoa iniciou todo o trabalho.
- Timestamp ISO com fuso é mostrado como DD/MM - HH:mm no fuso do navegador, como o histórico existente. Data sem hora mostra apenas DD/MM; valores ausentes, inválidos ou ambíguos ficam sem data/hora. Não há fallback para createdAt/updatedAt, hora atual ou o exemplo 13:50.
- Homologador recebe somente a função, sem inventar uma data de atribuição que o contrato não oferece.

Evidência de dados reais: leitura visual da TC492 às 20:20:50 UTC mostrou criação por felipe@travelcash.me em 14/10/2026 às 09:51 no navegador UTC−7 (16:51 UTC), mesmo minuto do grupo atual Cashia. O histórico visível não mostrava troca de responsáveis; Elmo e 13:50 aparecem somente no exemplo do pedido. Não foi consultado JSON ou API oculta. Por isso essa evidência confirma o minuto exibido pela UI, sem certificar os bytes de requester.recordedAt ou assignmentHistory.at. O ajuste permanece dinâmico, sem nomes/datas fixados.

Verificação específica: 18 casos TC492, incluindo ordem nome/função, remoção do cabeçalho, datas somente de campos registrados, legado sem meia-noite inventada, date-only, rejeição de datas inválidas/ambíguas, fusos UTC−7/UTC−3, preservação de grupos e contorno. O adapter e 37 casos TC482 também passaram. Suíte completa comparativa: 48 aprovados e as mesmas 30 falhas anteriores na base e no candidato, sem regressão nova. Revisão independente não encontrou bloqueadores. A fixture de browser foi atualizada com recordedAt e verificações da nova linha, mas não executada. QA visual do ajuste não executada; não foi salva alteração em produção.

---

## Escopo implementado

Apresentação baseada na proposta aprovada, com o ajuste de Felipe: o rótulo Responsáveis usa exatamente a mesma família, tamanho, peso e cor de Solicitante. Homologador indicado para a tarefa: Felipe. A entrega não aprova, conclui ou arquiva a tarefa.

- Resumo com projeto e uma linha compacta de prioridade/prazo.
- Fluxo sempre aberto: solicitante, sequência registrada de grupos de responsáveis, grupo atual e homologador.
- Fotos identificadas por e-mail, nomes completos com quebra de linha, iniciais de fallback e remoção de fotos que falham pelo listener existente.
- Grupos simultâneos preservados; atual destacado; Principal vem da ordem atual de responsible, sem alterar snapshots históricos. Retornos A → B → A permanecem distintos.
- Históricos sem origem conhecida e lacunas intermediárias são indicados no local correspondente. Nenhuma pessoa ou data é inferida de createdBy ou de histórico textual. Datas completas ficam disponíveis no título do rótulo compacto.
- A origem legada do solicitante continua acessível na descrição para leitores de tela e no título do grupo.
- Progresso ausente aparece como 0%, sem gravar zero nos dados. Valores informados continuam preservados, com barra limitada a 0–100 e aviso de valor fora da faixa. Removida a frase auxiliar sob a barra.
- Chamar atenção tem a mesma aparência de Marcar reunião. O fluxo anterior de confirmação e seleção de responsáveis, o responsável principal preselecionado, as restrições de homologação e a API de sinalização não mudam. O rótulo permanece depois do envio.

## Arquitetura e limites de escopo

Sem esquema, endpoint, migração ou alteração de permissões. O helper existente de proveniência fornece a mesma sequência aos cards e ao detalhe; acrescenta somente metadados de apresentação (data, grupo atual e origem ausente). O adapter do detalhe substitui apenas o contêiner de Fluxo, sem reescrever o editor, comentários, anexos ou ações.

A implementação inicial partiu de ca8e6f6c9f590e1c43aaab243dff86af1ccc9c87. Em 14/10, foi aplicado rebase seletivo local sobre d72c789b9deb511083c679a247f69a8ab00591d3, preservando o complemento TC493 de identidade de sessão, status HTTP e retenção de rascunho. A base foi verificada contra 257 blobs, incluindo os sete arquivos buscados no commit remoto exato. Alterações posteriores ainda exigem reconciliação antes de publicar. main.js difere da base somente nas duas strings do botão de atenção (carregamento e restauração). Não substituir integralmente main.js se a TC493 receber correções posteriores.

## Verificação local

- 12 novos casos em tests/check_task_detail_flow.mjs: A → B → A, grupos simultâneos, principal após reordenação, legado, lacunas, grupos vazios, entrada inválida, escaping/fotos, origem explícita, estrutura estática e preservação do handler de sinalização e precedência da correção sobre dimensões/margens legadas com !important.
- 37 casos existentes de TC482 aprovados.
- Adapter do detalhe aprovado, incluindo atualização sem mutação, tabs/teclado e reaberturas.
- Testes TC493 aprovados após rebase, incluindo os 20 casos compostos de gravação com main/client/API reais e serviços isolados. api.js, comment-editor.js e os testes TC493 ficam byte-idênticos à base d72c789; o delta de main.js contém somente as duas strings de apresentação do botão. Isso não substitui QA da gravação online.
- Suíte comparativa após rebase d72c789: base 76 checks, 46 aprovados e 30 falhas anteriores; candidato 77 checks, 47 aprovados e as mesmas 30 falhas. Nenhuma regressão nova de status.
- Sintaxe JavaScript, unicidade de IDs, CSS balanceado e diferença isolada de main.js verificadas.

## Revisão independente

A revisão independente confirmou os casos de legado, retornos, grupos simultâneos, principal atual, fotos/escaping do novo renderer, confirmação/permissões e merge seletivo. Detectou um conflito com custom.css, que impunha 38×38px a filhos diretos do container de responsáveis. Corrigido com override restrito aos novos grupos, incluindo width/height auto e remoção da sombra, todos com a precedência necessária. A margem legada de prazo também foi neutralizada somente no resumo compacto. Teste de regressão específico verifica os seletores, propriedades, prioridade !important e ordem das folhas.

Ressalva herdada identificada: ui.js interpola a foto do homologador em HTML antes de o adapter substituir o Fluxo. Este arquivo é idêntico à base e a vulnerabilidade não foi introduzida pela TC492. A revisão reproduziu injeção de atributo inofensivo em VM; isso impede tratar os testes do novo renderer como uma auditoria de segurança de toda a integração. A correção desse trecho precisa ser coordenada separadamente.

## QA visual e de integração ainda necessária

Foi preparada tests/browser_task_detail_flow.mjs para Chromium isolado usando a aplicação real, dados sintéticos e APIs locais. Inclui comparação de estilo computado, cancelamento e seleção de destinatários, progresso, regressão do editor TC493, ausência de permissões de homologação, dados legados, tema escuro, largura de 393px e reaberturas.

A execução não chegou a iniciar o navegador: o sandbox impediu criação de socket; a tentativa de execução com permissão ampliada falhou no lançamento do ambiente. Não houve captura de tela nem validação de pixels da implementação. A imagem de referência foi inspecionada, mas não é evidência de que a implementação renderizada corresponda a ela.

QA online e deploy permanecem pendentes de revisão coordenada e estabilização da base TC493. Nenhuma API de produção foi chamada por estes testes.

## Publicação e rollback

Nenhuma publicação feita nesta tarefa local. Quando autorizada, aplicar seletivamente os seis arquivos de runtime e preservar alterações concorrentes em app/index.html e app/js/main.js. A tarefa TC497 altera outro trecho de index.html (loader), devendo ser integrada por diff. Manter os testes e esta documentação junto da entrega.

Rollback seletivo: restaurar somente os trechos TC492, preservando TC493 e TC497. Não alterar dados de requester, assignmentHistory, responsible ou homologador; nenhuma migração precisa ser revertida.

## Segunda revisão de quebra de linha (14/10)

Base exata: 67dd868b5ef3d354010f0bdf9d9e2a3d1f4349bb. O delta de runtime altera apenas task-fidelity-v2.css. O navegador online confirmou que o texto de cargo/data da Cashia ocupava duas linhas num espaço de 149px; os fragmentos medidos exigem aproximadamente 195,47px. A barra lateral do detalhe passa de 260 para 340px em telas a partir de 881px. De 681 a 880px, o detalhe usa uma coluna; em telas menores permanece o empilhamento existente. O espaçamento avatar/texto diminui de 16 para 12px e o recuo lateral em telas até 360px passa a 6px, com intervalo avatar/texto de 8px nesse limite estreito para reservar espaço também quando há barra de rolagem clássica de 15px. Nenhum tamanho de fonte, dado, data, homologador ou editor é alterado. Não usamos nowrap, corte, reticências ou ocultação para esconder a falha. Nomes muito longos continuam podendo quebrar com segurança.

Testes locais: 78 verificações, 48 aprovadas e as mesmas 30 falhas da base; sem mudança de status. O teste TC492, atualizado depois da suíte, passou com 19 casos. Foi acrescentada medição real via Range.getClientRects e limites de conteúdo em 320,360,393,680,768,880,881,1024 e1440px. Essa medição NÃO foi executada: Chromium falha ao criar socket no ambiente atual. Logo, o cálculo de largura é evidência de projeto, não prova visual. É obrigatório verificar o candidato publicado antes de mover a tarefa para Homologação, incluindo nome na primeira linha, cargo/data completos na segunda, contorno azul atual, ausência de Atuais e legibilidade do conteúdo principal.

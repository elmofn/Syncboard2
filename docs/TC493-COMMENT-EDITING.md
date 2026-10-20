# TC493 — edição de comentário multilinha

Status: primeira correção publicada em `ca8e6f6c9f590e1c43aaab243dff86af1ccc9c87`; complemento de gravação preparado localmente após reprovação. Nenhum comentário real alterado para teste.

## Complemento após teste de gravação — 14/10/2026

Felipe relatou que a edição não funcionou após a primeira entrega. A QA inicial havia verificado somente abrir, inserir quebra de linha e cancelar; não havia validado Salvar online. O erro específico da sessão de Felipe não foi capturado, portanto a causa abaixo está confirmada em reprodução local, sem atribuir certeza ao incidente online.

### Falha de contrato reproduzida

`main.js` enviava `currentUser.userId` como `author`, priorizando-o sobre `userDetails`. Porém `api/addComment` grava `author: user.userDetails`, mantendo `userId` em campo separado. O handler `api/editComment` compara o `author` recebido ao nome/e-mail salvo, sem comparar ao `userId` separado. Uma sessão normal com ID opaco e e-mail portanto envia uma identidade incompatível com esse contrato e recebe 403.

O novo teste executa o handler real de main, a função real de api.js e o handler real de Azure com transporte/Cosmos isolados. Contra a base publicada: ID opaco, 403, zero gravações. Contra a correção: `userDetails` da sessão, uma gravação bem-sucedida. Autor incorreto continua rejeitado, sem tentar outra identidade.

### Correção complementar

- Enviar `userDetails` da sessão autenticada, com fallback apenas para `email` da mesma sessão. Nunca copiar o autor salvo do comentário, usar perfil de outra pessoa ou trocar a identidade depois de uma rejeição.
- Se a sessão não contém essa identidade, interromper antes do envio e manter o rascunho.
- Preservar `error.status` no transporte frontend e distinguir 401, 403, 404 e 409 no diálogo. Os erros mantêm o rascunho; não há retry automático.
- Backend, endpoints, schema e verificação de permissão existentes não foram alterados. A confiança já existente em `body.author` no servidor permanece um assunto separado; esta correção não a torna uma garantia de segurança da sessão.

A hipótese de normalização HTML não foi reproduzida: o botão codifica o texto original com `encodeURIComponent`, e o handler o decodifica para a comparação com o estado original. A serialização do editor é enviada como novo texto; uma fixture com aspas normalizadas e HTML/menção/imagem preservados passa a gravação.

Testes do complemento:

- `TC493_SOURCE_ROOT=../tc493-save-base node tests/check_comment_save_contract.mjs --expect-broken`: reproduz 403 da versão publicada.
- `node tests/check_comment_save_contract.mjs`: 20 cenários passaram, incluindo sessão com ID opaco/e-mail, autores corretos/incorretos, fallback da própria sessão, identidade ausente, HTML normalizado, índice legado, status HTTP e conflito de ETag. Inclui três fluxos completos com o diálogo real: Salvar com sucesso, 403 mantendo rascunho e Cancelar sem requisição.
- `node tests/check_comment_editing.mjs`: passou, incluindo retenção de rascunho em 401/403/404/409/500.
- A cobertura de Salvar ainda é local com serviços isolados. Não foi salva edição de comentário real para teste.

Arquivos de runtime deste complemento: `app/js/main.js`, `app/js/api.js` e `app/js/comment-editor.js`. O CSS da primeira correção permanece intacto.

## Registro da primeira correção

## Evidência e diagnóstico

- A imagem anexada à tarefa mostra o diálogo nativo “Editar comentário”, com um campo de linha única, e um comentário com vários parágrafos ao fundo. Não há mensagem de erro visível.
- Na base `c6e6417e0a42fe60f43769a4fe1ce2d2121912dc`, `app/js/main.js` abre `window.prompt` com o conteúdo original e envia o retorno à API. Esse fluxo não oferece edição visual multilinha nem representação rica do conteúdo que o feed já renderiza.
- Confirmado: incompatibilidade da interface de edição com comentários multilinha/HTML. A edição anterior encaminhava texto para `api.editComment`, sem editor rico.
- Não confirmado: a imagem não prova falha de gravação, rejeição da API ou perda persistida de quebras de linha. Não foi editado comentário real para tentar reproduzir esses sintomas.

Os blobs de main.js, ui.js, collaboration-v2.css, index.html e api/editComment/index.js foram comparados à revisão acima e coincidem com a cópia base usada nos testes.

## Alteração mínima

- Novo diálogo modal com editor `contenteditable` multilinha, Salvar alterações e Cancelar. Enter cria linha; Ctrl/Cmd+Enter também pode salvar.
- O editor recebe o HTML existente sem converter para texto simples: mantém parágrafos, listas, menções com data-email, imagens e espaços. Alteração efetiva salva `innerHTML`, sem trim do conteúdo.
- Salvar sem alterações fecha sem enviar uma requisição. A normalização de HTML pelo navegador é comparada à representação inicial do próprio editor.
- Cancelar/Escape descartam o rascunho sem gravação. Durante gravação os controles ficam bloqueados para evitar requisições duplicadas; falha devolve os controles e mantém o rascunho.
- Alterações de comentários recebidas durante a edição são verificadas antes do envio. Comentários legados por índice exigem que a lista não tenha mudado; comentários com id podem mudar de posição. Um conflito preserva o rascunho e orienta a reabrir o conteúdo atualizado.
- Resposta tardia não substitui uma versão local mais nova recebida por SignalR, nem reabre detalhe fechado/de outra tarefa. Retorno às notificações é preservado.

API, schema, autorização de autor e criação de comentários permanecem fora desta alteração. A validação cliente não garante detectar mudanças do servidor que ainda não chegaram via SignalR; esse limite do contrato da API permanece. Menções já existentes são preservadas; este editor não adiciona autocomplete de novas menções nem fluxo de upload.

## Verificações executadas

- `node tests/check_comment_editing.mjs`: passou. Executa o diálogo e o handler reais com DOM/API controlados. Cobre texto multilinha e rico, espaços/Unicode, cancelamento, reabertura, sem alteração, comentário vazio/somente imagem, falha/repetição, bloqueio de envio duplicado, Enter, navegador sem dialog, contrato UUID/índice e concorrência antes/durante PUT.
- Sintaxe de 53 arquivos JavaScript de frontend e API: passou.
- 75 checks do repositório executados contra candidato e base: candidato 45 passaram; base 44 passaram; o novo teste é a diferença. As mesmas 30 verificações históricas falham nos dois, por snapshots congelados ou dependência de histórico Git ausente. Nenhuma verificação que passava na base passou a falhar. Isto não é uma suíte integral verde.
- Revisão independente encontrou duas corridas no primeiro rascunho; foram corrigidas e os testes correspondentes passaram na revisão final.
- Nenhuma alteração de backend, banco, comentário real, tarefa real ou publicação foi feita por esta correção.

## Limites e QA pendente

Não houve validação nativa de geometria, teclado, foco, mobile ou visual nos temas. O Chromium isolado não iniciou por restrição do ambiente; não foi usado outro acesso ao navegador para contornar esse bloqueio. Não há captura de tela pós-correção nem prova de homologação em produção.

`tests/fixtures/tc493-comment-editing.html` é uma prévia autocontida, com dados sintéticos e CSP que bloqueia rede/API. Pode ser aberta localmente em um navegador autorizado, sem servidor público. Inclui o prompt antigo para comparação e o novo diálogo com falha simulada. Ela não foi executada visualmente neste ambiente.

Checklist de QA quando houver navegador autorizado:

1. Abrir texto com vários parágrafos; conferir leitura completa e Enter/Shift+Enter.
2. Editar somente um trecho em comentário com negrito, lista, menção e imagem; conferir que os demais elementos permanecem.
3. Cancelar e Escape; reabrir e confirmar conteúdo original. Testar Tab/Shift+Tab e restauração do foco.
4. Simular erro e tentar novamente; confirmar retenção do rascunho e apenas um envio simultâneo.
5. Validar viewport estreito e temas claro/escuro, rolagem e ausência de transbordamento.
6. Confirmar navegação fechada/diferente e atualização concorrente em fixture, sem modificar comentário real para teste.

## Arquivos de produção alterados

- `app/js/main.js`
- `app/js/comment-editor.js` (novo)
- `app/css/collaboration-v2.css`

Rollback: remover a importação e restaurar o bloco de edição e o CSS à base citada; remover o novo módulo. Não há migração ou alteração persistida de schema para reverter.

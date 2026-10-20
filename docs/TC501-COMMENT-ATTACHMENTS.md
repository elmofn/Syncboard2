# TC501 — Anexos em comentários

## Escopo

- O compositor de comentários usa o mesmo seletor múltiplo, linhas de arquivo e transporte de upload da criação de tarefas.
- O usuário escreve o comentário, seleciona os arquivos e envia. A exigência anterior de texto ou imagem inline permanece: anexos sozinhos não enviam um comentário.
- Os arquivos enviados aparecem no comentário correspondente. Links abrem em outra aba, inclusive PDFs e imagens.
- Seleção e texto sobrevivem à atualização da mesma tarefa via SignalR. Fechar o detalhe ou abrir outra tarefa descarta o rascunho, conforme a ajuda na tela.

## Contrato aprovado

Cada objeto em `comments` pode conter `attachments`, um array opcional de `{url, name, contentType}`. O formato é o mesmo retornado por `/api/tasks/attachments`.

- Campo ausente mantém o comentário legado, sem migração ou backfill.
- `addComment` valida a estrutura, os três campos textuais e URLs absolutas HTTPS sem credenciais. Campos extras dos descritores não são persistidos.
- Autoria continua derivada da sessão autenticada. A gravação mantém `IfMatch` e o conflito `409` existentes.
- A resposta da tarefa, `getTasks` e o evento `taskUpdated` transportam os anexos do comentário.
- `task.attachments`, papéis, permissões, rotas, storage, status e homologação não mudam.
- A edição de texto preserva anexos. Excluir o comentário remove suas referências; não apaga os blobs.
- Nomes e URLs dos anexos não são adicionados às notificações de menção ou do Discord.

## Falhas e concorrência

- Os arquivos sobem ao enviar. O comentário só é gravado após todos os uploads necessários terem retornado descritores válidos.
- Clique duplo e Enter repetido compartilham a mesma trava de envio.
- Uploads confirmados ficam no rascunho para não serem repetidos quando outro arquivo falha.
- Fechar ou trocar de tarefa durante o upload impede o POST posterior. Fechar depois de iniciar o POST não cancela uma gravação que já chegou ao servidor; a resposta não reabre o detalhe.
- Falhas HTTP conhecidas preservam texto e arquivos. Não há repetição automática.
- Uma resposta de gravação perdida, inválida ou `5xx` é tratada como resultado incerto: novo envio fica bloqueado nesse rascunho, e a tela orienta copiar o texto e conferir os comentários ao reabrir.
- Falhas de renderização depois de uma gravação confirmada não são apresentadas como falha ao salvar.
- A montagem do editor durante a animação não depende da classe transitória `show`; os estados de seleção, envio e incerteza permanecem aplicados.

## Limites preservados

O armazenamento existente retorna URLs públicas. Ele não mantém propriedade ou vínculo por arquivo e não estabelece limites de aplicação para tamanho, quantidade ou tipo. Esta entrega não cria acesso privado, validação de propriedade ou exclusão física automática. Upload e gravação são operações separadas; falhas ou cancelamentos podem deixar blobs sem referência, como no fluxo anterior.

A edição/exclusão de comentários mantém as regras já existentes. Esta alteração não representa uma revisão geral de autorização ou sanitização do texto rico.

## Verificação local

```sh
node tests/check_comment_attachments_api.mjs
node tests/check_comment_attachments_ui.mjs
node tests/check_comment_save_contract.mjs
node tests/check_comment_editing.mjs
node tests/check_comment_mentions.mjs
node tests/check_notification_progress.mjs
node tests/check_approval_continue.mjs
node tests/check_forward_detail_close.mjs
node tests/check_home_focus_v2.mjs
```

Os testes novos executam os handlers reais com Cosmos/Blob/HTTP isolados e o compositor/renderizador com DOM controlado. Cobrem persistência e releitura sintéticas, metadados adversariais, autoria, conflitos, falhas, repetição, SignalR, animação, fechamento, troca de tarefa e resposta incerta.

Base de desenvolvimento: `5d4ed6b8eecfd53a54300623229df16fa6ecdd82`. Os 266 arquivos da base foram comparados com os hashes do GitHub antes da alteração.

Rebase de publicação: `440f7d47b0cf34a0efcc4dcba24381e398b22db5`, preservando TC499, TC496, TC503 e TC495. Comparação atual: 54 verificações aprovadas na base e 56 na candidata, com os mesmos 30 bloqueios/falhas anteriores e nenhuma regressão. Os testes novos cobrem 97 casos de API e 50 de UI; sem execução em navegador.

## Homologação visual pendente

Após autorização de publicação, conferir com o homologador:

1. Seletor nativo usando o controle visível Adicionar; seleção múltipla, cancelar e remover antes de enviar.
2. Comentário com PDF e imagem, recarregar a tarefa e abrir ambos os links persistidos.
3. Comentário legado, edição de texto sem perder anexos e preservação dos anexos da própria tarefa.
4. Interrupção de rede, atualização em outra sessão, clique duplo, fechar e trocar de tarefa durante o envio.
5. Teclado, foco, temas e largura móvel.

Os testes locais não afirmam execução no navegador, upload real, alteração de produção ou homologação concluída.

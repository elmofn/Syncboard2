# TC488 — Filtros e leitura em lote de notificações

## Implementação

- Filtro acessível Todas / Não lidas / Lidas no modal de notificações, preservado durante atualizações e reabertura.
- Botão “Marcar todas como lidas” para as notificações da própria conta autenticada, independentemente do filtro visual.
- A ação consulta a lista atual da conta, marca somente as não lidas usando a rota existente `/api/markNotificationRead`, com no máximo quatro chamadas simultâneas. Não há nova rota, campo de banco ou privilégio administrativo.
- O servidor existente resolve a partição pelo usuário autenticado; o cliente envia apenas o ID da notificação.
- Bloqueio de cliques repetidos durante a operação, resultado parcial com nova tentativa, tratamento de falhas HTTP e preservação da lista/badge em falha de consulta.
- Respostas antigas são descartadas. Notificações que chegam depois do início da ação permanecem não lidas após a atualização final.
- O contador continua mostrando o total não lido, independentemente do filtro.

## Base e compatibilidade

Base de publicação: `9b18a11e348826e9dfc0c8808312df3275f25da0`, preservando as entregas TC482 e TC484. O patch TC488 contém somente nove arquivos desta melhoria; nenhuma alteração de API backend, modelo de dados ou permissões.

Publicação autorizada pelo usuário em 14/10/2026 após tornar o repositório privado. Os testes abaixo foram repetidos sobre a base publicada antes do envio. A confirmação de deploy e QA online deve ser consultada no workflow do commit e no registro operacional da tarefa, sem inferir aprovação a partir dos testes locais.

## Verificação

- 7 cenários novos de filtros/leitura em lote: seleção, badge, filtro persistente, atualização prévia, notificações lidas ignoradas, falha parcial/repetição, concorrência limitada, falhas de carga sem mutação, recuperação, resposta antiga, novas chegadas, erro HTTP e payload sem usuário.
- 59 testes existentes de progresso/notificações também passam: total focado 66/66.
- Teste existente de pessoas/notificações atualizado apenas para suportar a nova função exportada, refresh ao abrir e contrato de falha HTTP explícito; callbacks de navegação/teclado/leitura continuam verificados.
- Comparação agregada dos scripts `check_*`: base integrada 43 passam/30 falham; candidato TC488 44 passam/30 falham, nenhuma regressão. Falhas preexistentes incluem snapshots históricos e dependências de histórico Git indisponível; não representam aprovação integral da suíte.
- 52 arquivos JavaScript passaram `node --check`.
- Não executado: QA visual em navegador, Azure/emuladores, escrita real no Cosmos DB, produção. Testes usam fixtures sintéticas locais e não notificações reais.

## Homologação sugerida

Com Felipe Igansi, depois de autorizada a publicação: conferir filtros com notificações reais da própria conta, badge independente do filtro, botão desabilitado quando tudo lido, execução em Lidas marcando também Não lidas, nova notificação posterior permanecendo não lida e navegação de volta da tarefa. Simular falha de rede somente em ambiente seguro, verificando feedback, preservação da lista e nova tentativa.

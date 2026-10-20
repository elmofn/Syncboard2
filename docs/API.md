# Syncboard — Contrato da API (congelado para reconstrução do frontend)

> **Propósito.** Este documento descreve o contrato **atual** da API do Syncboard (Azure Functions) exatamente como está em produção hoje, para servir de **alvo estável** da reconstrução do frontend (`web/`, React+Vite+TS) e, depois, do acesso direto do agente via API. É descritivo, não prescritivo: registra o comportamento existente — inclusive bugs e inconsistências, que ficam **marcados** mas **não são corrigidos aqui** (correções estão nas Fases 1b/4 do roadmap). Fonte da verdade: `api/*/function.json` + `api/*/index.js`, `api/shared/*.js`, `app/js/api.js`, `app/js/signalr.js`. Última extração: 2026-10-20.

## 1. Visão geral

- **Plataforma:** Azure Static Web Apps + Azure Functions (Node 20, modelo v3 `function.json`). Realtime via Azure SignalR. Anexos em Azure Blob Storage. IA via Google Gemini.
- **Base path:** todos os endpoints ficam sob `/api/`. Todas as funções têm `authLevel: "anonymous"` na camada Functions — a autenticação real é imposta pela **plataforma SWA** (ver §2).
- **Formato:** JSON em requests/responses (exceto upload de anexo, que é binário). `Content-Type: application/json` nas escritas.
- **Idioma:** mensagens de erro e rótulos em português.

## 2. Autenticação e autorização

Autenticação é **nativa do SWA com Google OAuth** — não há auth customizada nem token no cliente.

- **Login/logout (plataforma):**
  - `GET /.auth/login/google` — inicia o OAuth (escopos: `userinfo.email`, `userinfo.profile`, `auth/calendar` — este último **pedido mas não usado**).
  - `GET /.auth/logout` — encerra a sessão (rota `/logout` redireciona para cá).
  - `GET /.auth/me` → `{ "clientPrincipal": {...} | null }`. É assim que o frontend descobre o usuário (ver `getUserInfo()` em `app/js/api.js`).
- **Client principal** (injetado pela plataforma em cada chamada de API no header `x-ms-client-principal`, base64 de JSON):
  ```json
  {
    "identityProvider": "google",
    "userId": "<id opaco>",
    "userDetails": "usuario@empresa.com",   // e-mail — chave de identidade em todo o backend
    "userRoles": ["authenticated", "travelcash_user", "admin?"],
    "claims": [{ "typ": "name|picture|email|...", "val": "..." }]
  }
  ```
- **Gate de rotas** (`app/staticwebapp.config.json`): `/*` exige o role **`travelcash_user`**; 401/403 redirecionam para `/login`. Único endpoint anônimo: `/api/discord-interactions`. ⚠️ O role `travelcash_user` é legado de outro projeto (renomeação planejada para a Fase 4).
- **Whitelist (`rolesSource`) — `POST /api/getRoles`:** callback chamado **pela plataforma** (não pelo cliente) a cada login. Recebe o client principal; busca o e-mail na container `Users`. Se existe → `roles: ['authenticated','travelcash_user']` (+ `'admin'` se `isAdmin`); senão → só `['authenticated']` (barrado no `/*`). **Estar na tabela `Users` = ter acesso.**
- **Imposição por função (inconsistente — estado atual):**
  - Derivam identidade e exigem `admin`: `addUser`, `updateUser`, `deleteUser`.
  - Exigem identidade autenticada: `createTask`, `addComment`, `signalResponsible`, `dismissAlert`, `getNotifications`, `markNotificationRead`, `updateUserPhoto`; homologação em `updateTask` (via `actorEmail`, que exige o role `travelcash_user`).
  - Defesa explícita de role no código: `getProjectTaskCounts`.
  - ⚠️ **Sem checagem de identidade no código** (protegidos só pelo gate de plataforma): `getTasks`, `getUsers`, `getArchivedTasks`, `deleteTask`, `deleteComment`, `updateOrder`, `updateProjectColor`, `uploadAttachment`, `deleteAttachment`, `improveTitle`. (Endurecimento na Fase 4.)

## 3. Convenções transversais

- **Concorrência otimista (ETag).** Tarefas usam `_etag` do Cosmos. As escritas de tarefa aceitam no body:
  - `expectedEtag` — o `_etag` da tarefa que o cliente tinha ao abrir.
  - `expectedStatus` — o status esperado.
  Conflito (412 do Cosmos) é mapeado para **HTTP 409** com mensagem "A tarefa foi alterada. Reabra/atualize antes de salvar." O cliente deve reabrir e tentar de novo.
- **Campos server-owned** (ignorados/removidos se vierem no body de `updateTask`): `id`, `history`, `_etag`/`_rid`/`_self`/`_ts`/`_attachments`, `createdBy`, `createdAt`, `requester`, `assignmentHistory`, `comments`, `actor`, `pendingAlerts`, e os auxiliares de decisão (`expectedStatus`, `expectedEtag`, `newResponsibleEmail`, `forwardInstructions`, `continuityInstructions`). Identidade nunca é lida do body — sempre do principal.
- **Status da tarefa (enum):** `todo` · `stopped` · `inprogress` · `homologation` · `publication` · `done`. Rótulos exibidos: Fila · Parado · Andamento · Homologação · Publicação · Concluída. `done` = arquivada.
- **Efeitos colaterais:** a maioria das escritas de tarefa dispara (a) evento SignalR (§8), (b) webhook Discord quando configurado. Discord/IA são best-effort e não falham a request.
- **Erros:** não há envelope padronizado — a maioria retorna string em texto. Exceção estruturada: `createTask` retorna `{ code: "TASK_PROVENANCE", message }` em erro de provência. Códigos comuns: 400 (validação), 401 (sem identidade), 403 (role/permissão), 404 (não encontrado), 409 (conflito de concorrência), 500 (erro interno).

## 4. Modelos de dados

Banco CosmosDB `TasksDB`. Containers: `Tasks` (PK `/id`), `Users` (PK `/email`, `id == email`), `Notifications` (PK `/targetUserEmail`).

### 4.1 Task (container `Tasks`)
```jsonc
{
  "id": "TC-001",                 // PK; sequencial humano (gerado via doc singleton "taskCounter")
  "numericId": 1,
  "title": "string",
  "description": "string",         // HTML
  "responsible": [                 // array; item objeto OU string legada
    { "email": "a@x.com", "name": "Ana", "picture": "https://..." }
  ],
  "homologador": {                 // opcional; objeto OU string legada; o revisor
    "email": "b@x.com", "name": "Bia", "picture": "https://..."
  },
  "status": "todo",                // enum §3
  "priority": "Média",             // texto livre (ex.: Baixa/Média/Alta)
  "project": "string",
  "projectColor": "#526D82",
  "azureLink": "string",
  "dueDate": "2026-10-31" | null,
  "order": -1697040000000,         // ordenação (negativo = topo)
  "attachments": [ { "url": "https://...", "name": "f.pdf", "contentType": "application/pdf" } ],
  "comments": [ /* ver 4.4 */ ],   // embutido
  "pendingAlerts": [ /* ver 4.5 */ ],
  "history": [ /* ver 4.6 */ ],    // embutido; description contém HTML
  "continuityInstructions": "string", // definido no "forward" da homologação
  "requester": {                   // server-owned; derivado do auth, nunca do cliente (createProvenance)
    "email": "quem@criou.com", "name": "Nome",
    "source": "self_declared", "recordedByEmail": "quem@criou.com",
    "recordedAt": "ISO-8601", "evidenceRef": null
  },
  "assignmentHistory": [           // server-owned; +1 entrada só quando os responsáveis mudam (applyProvenance)
    { "at": "ISO-8601", "actorEmail": "quem@mudou.com",
      "from": [ { "email": "a@x.com", "name": "Ana" } ],   // snapshot anterior
      "to":   [ { "email": "b@x.com", "name": "Bia" } ] }   // snapshot novo
  ],
  "notificationStageVersion": 0,      // watermark server-owned (notificações)
  "notificationsReadThroughStage": -1,
  "createdBy": "Nome do criador",     // string (display name)
  "createdAt": "ISO-8601",
  "_etag": "\"...\""                  // concorrência
}
```

> `requester` e `assignmentHistory` são **read-only** para o cliente: o front pode exibi-los (auditoria de quem pediu e das trocas de responsável), mas se enviá-los numa escrita eles são descartados. `from`/`to` são arrays de snapshots `{email, name}`, não strings.

### 4.2 User (container `Users`)
```jsonc
{
  "id": "usuario@empresa.com",      // == email (minúsculo)
  "email": "usuario@empresa.com",
  "name": "Nome",                    // nome "real"/original
  "displayName": "Nome exibido",
  "role": "Cargo/função (texto)",
  "picture": "https://...",
  "isAdmin": false,
  "isAiAgent": false,                // selo "Agente IA" (hoje só visual; não concede acesso)
  "homologationReservations": [ { "taskId": "TC-1", "taskEtag": "..." } ] // fencing de revisor
}
```
`getUsers` acrescenta um sentinela sintético `{ "name": "DEFINIR", "email": "", "picture": "" }`.

### 4.3 Notification (container `Notifications`)
```jsonc
{
  "id": "uuid",
  "targetUserEmail": "usuario@empresa.com",  // PK
  "type": "mention" | undefined,
  "taskId": "TC-001",
  "taskTitle": "string?",
  "message": "string",                 // ex.: "Homologação Pendente", "Você foi mencionado por ..."
  "commentPreview": "string",
  "isRead": false,
  "createdAt": "ISO-8601",
  "taskStageVersion": 0                 // usado na reconciliação
}
```

### 4.4 Comment (embutido em `Task.comments`)
```jsonc
{
  "id": "uuid",
  "text": "string",           // HTML (menções como <span data-email="..."> ...)
  "author": "Nome ou {email,name}", // em comentários novos: userDetails (e-mail/nome do principal)
  "userId": "id do principal",
  "timestamp": "ISO-8601",
  "editedAt": "ISO-8601?",
  "attachments": [ { "url": "https://...", "name": "...", "contentType": "..." } ] // opcional
}
```

### 4.5 pendingAlert (embutido em `Task.pendingAlerts`)
```jsonc
{ "targetUser": "Nome do responsável", "signaledBy": "Nome", "timestamp": "ISO-8601", "acknowledgedAt": "ISO-8601?" }
```

### 4.6 history entry (embutido em `Task.history`)
```jsonc
{ "action": "created|edited|attention_requested|...", "description": "HTML", "timestamp": "ISO-8601" }
```
⚠️ `description` guarda HTML de apresentação (ex.: `<span class="font-bold text-white">`). Acopla o banco ao estilo do front; limpeza planejada na Fase 3.

## 5. Endpoints — Tarefas

> Nota de rota: `getTasks`, `getUsers`, `getRoles` e `getProjectTaskCounts` declaram `"routeName"` (propriedade **inválida**) no `function.json` em vez de `"route"`; a rota efetiva cai no **nome da pasta** (igual ao que está abaixo). Funciona, mas é bug (corrigir na Fase 1b).

| Método | Rota | Auth (código) | Descrição |
|---|---|---|---|
| GET | `/api/getTasks` | — (só plataforma) | Lista tarefas ativas (`status <> 'done'`). Resp 200 `Task[]`. |
| GET | `/api/getArchivedTasks` | — | Lista arquivadas (`status == 'done'`). Resp 200 `Task[]`. |
| GET | `/api/getProjectTaskCounts` | `travelcash_user` | Agregado por projeto. Resp 200 `[{project, active, total}]`. 401/403. |
| POST | `/api/createTask` | autenticado | Cria tarefa (ver 5.1). Emite `taskCreated`. |
| PUT | `/api/updateTask/{id}` | autenticado / role conforme modo | Atualiza (ver 5.2). Emite `taskUpdated`. |
| DELETE | `/api/deleteTask/{id}` | — | Exclusão **permanente**. Resp 204. Emite `taskDeleted` (arg = id). |
| POST | `/api/updateOrder` | — | Reordena em lote. Emite `tasksReordered`. |
| POST | `/api/updateProjectColor` | — | Recolore todas as tarefas de um projeto. Emite `tasksReordered`. |

### 5.1 `POST /api/createTask`
- **Body:** `{ title*, description*, responsible*, homologador?, azureLink?, project?, projectColor?, priority?, dueDate?, attachments? }`.
- Regras: `status` deve ser `'todo'` ou omitido (400 caso contrário). `homologador` é opcional, mas se informado precisa resolver para um usuário cadastrado. Campos de identidade/criador vêm do principal.
- **Resp:** 200 `Task` criada. **Erros:** 400 (validação; provência → `{code:'TASK_PROVENANCE',message}`), 401 (sem identidade).

### 5.2 `PUT /api/updateTask/{id}` — três modos (mutuamente exclusivos pela presença de chaves)
1. **Edição genérica** (sem `homologationAction`/`homologationRecovery`): body com campos editáveis (`title`, `description`, `priority`, `dueDate`, `project`, `projectColor`, `responsible`, `attachments`, `status`, `homologador`). Ao mudar `status` fora de homologação, envie `expectedStatus` + `expectedEtag` (409 em conflito). Campos server-owned são removidos. Entrar em `homologation` exige `homologador` cadastrado (`validateEntry`). Edição de `responsible` durante homologação exige `admin` (`responsibleEditUpdate`).
2. **Decisão de homologação** (`homologationAction`): `{ homologationAction: "approve"|"reject"|"forward", expectedStatus: "homologation", expectedEtag, newResponsibleEmail?*, forwardInstructions?* }`. Só o **homologador designado e cadastrado** decide (403 caso contrário). `approve` → `status: publication`, `progress: 100`; `reject` → `status: inprogress`, `homologador: null`; `forward` → `status: inprogress`, novo `responsible` (exige `newResponsibleEmail` + `forwardInstructions`), `continuityInstructions`.
3. **Recuperação** (`homologationRecovery: true`): `{ homologationRecovery:true, homologador, expectedStatus, expectedEtag }`. Só **admin**, só quando a tarefa está em `homologation` sem homologador válido. Apenas designa o homologador.
- **Resp:** 200 `Task` atualizada. **Erros:** 400, 403, 404, 409. Emite `taskUpdated`.

### 5.3 `POST /api/updateOrder`
- **Body:** array de tarefas com `{ id, order }` (os demais campos são ignorados): `[{ "id": "TC-1", "order": -123 }, ...]`. Patch em lote (batches de 100). ⚠️ Sem validação de body/role. **Resp:** 200 texto. Emite `tasksReordered`.

### 5.4 `POST /api/updateProjectColor`
- **Body:** `{ projectName*, newColor* }`. Repinta `projectColor` de todas as tarefas do projeto. **Resp:** 200 texto. 400 se faltar campo. Emite `tasksReordered`.

### 5.5 `DELETE /api/deleteTask/{id}`
- Exclusão permanente (hard delete). **Resp:** 204; 404 se não existe. ⚠️ Sem checagem de role. Emite `taskDeleted` com o **id** (string) como argumento.

## 6. Endpoints — Comentários (embutidos na tarefa)

| Método | Rota | Auth (código) | Descrição |
|---|---|---|---|
| POST | `/api/addComment/{id}` | autenticado | Adiciona comentário. Emite `taskUpdated` (hub `tasks`). |
| PUT | `/api/tasks/{taskId}/comments/{commentId}` | autor | Edita comentário. Emite `taskUpdated` ⚠️ **no hub `default`** (ver §8). |
| DELETE | `/api/deleteComment/{id}` | — | Remove comentário por **índice**. Emite `taskUpdated`. |

- **`addComment`** — Body: `{ text*, attachments? }`. `text` é HTML; menções devem conter `data-email="<email>"` nos spans para gerar notificações internas (`type:'mention'`). `attachments`, se presente, deve ser array de `{ url(HTTPS absoluta)*, name*, contentType* }` — qualquer outro formato → 400. `author`/`userId` vêm do principal. **Resp:** 200 `Task`. Erros 400/404/409.
- **`editComment`** — Body: `{ text*, author* }` (`author` = e-mail; precisa casar com o autor do comentário, senão 403). `{commentId}` casa por `id` do comentário ou, como fallback, índice numérico. **Resp:** 200 `Task`. 403/404/409. ⚠️ Usa binding de input Cosmos e emite no hub **`default`** — clientes conectados ao hub `tasks` **não recebem** esse evento (bug; corrigir Fase 1b).
- **`deleteComment`** — Body: `{ index* }` (índice no array `comments`). ⚠️ Endereçamento por índice é frágil/racy e não há checagem de role. **Resp:** 200 `Task`. 400 (índice inexistente)/404/409.

## 7. Endpoints — Anexos, Usuários, Notificações/Alertas, IA

### 7.1 Anexos (Blob Storage, container `syncboard-attachments`)
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/tasks/attachments` | Upload binário. Headers: `x-file-name` (URI-encoded), `x-file-type`, `Content-Type: application/octet-stream`. Body = bytes do arquivo. **Resp:** 200 `{ url, name, contentType }`. 400 se vazio. ⚠️ Sem checagem de role. |
| DELETE | `/api/tasks/attachments/{blobName}` | Remove blob. **Resp:** 204 (404 do storage também vira 204). ⚠️ Sem checagem de role. |

O fluxo típico: faz upload → recebe `{url,name,contentType}` → salva esse objeto em `Task.attachments` (via `updateTask`) ou em `Comment.attachments` (via `addComment`).

### 7.2 Usuários (admin, salvo foto)
| Método | Rota | Auth | Body / Descrição |
|---|---|---|---|
| GET | `/api/getUsers` | — | Lista usuários + sentinela `DEFINIR`. (cliente usa `?t=<ts>` anti-cache.) |
| POST | `/api/addUser` | `admin` | `{ email*, displayName*, role?, isAdmin?, isAiAgent? }`. 400/403/409 (já existe). `id==email` minúsculo. |
| PUT | `/api/updateUser/{id}` | `admin` | `{ email*, displayName*, role?, isAdmin?, isAiAgent? }`. Trocar o e-mail = recriar com novo id + apagar antigo (com fencing/ETag; 409 em concorrência). `name` original é preservado; `isAiAgent` omitido preserva o valor salvo. |
| DELETE | `/api/deleteUser/{id}` | `admin` | `{id}` = e-mail (URI-encoded). Não pode apagar a si mesmo (400). 204/403/404/409. |
| POST | `/api/updateUserPhoto` | autenticado (self) | `{ pictureUrl* }`. PATCH só do `/picture` do próprio usuário. **Resp:** 200 `User`. 400/401/404. (Sem `route` no `function.json` → rota = nome da pasta.) |

### 7.3 Notificações e alertas
| Método | Rota | Auth | Body / Descrição |
|---|---|---|---|
| GET | `/api/getNotifications` | autenticado | Notificações do usuário logado (`targetUserEmail == email`), reconciliadas, `Cache-Control: no-store`. 401 → `[]`. |
| POST | `/api/markNotificationRead` | autenticado | `{ id* }`. Marca `isRead=true` (partição = e-mail do usuário). 200; 400 sem user/id. ⚠️ replace sem ETag. |
| POST | `/api/signalResponsible/{id}` | autenticado | `{ targets*: string[] }` (nomes de responsáveis). Valida que os alvos são responsáveis da tarefa. Grava `pendingAlerts`, alerta no Discord. **Resp:** 200 `Task` (releitura). 400/401/404/409. Emite `taskUpdated`. |
| POST | `/api/dismissAlert/{id}` | autenticado | `{ expectedEtag? }`. "Vou olhar": marca `acknowledgedAt` do alerta do usuário atual e cria uma notificação-lembrete. **Resp:** 200 `Task` (releitura). 401/404/409. Emite `taskUpdated`. |

### 7.4 IA / Integrações
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/improveTitle` | — | `{ currentTitle*, userInstruction? }` → `{ title }` (reescrita via Gemini 2.5 Flash). 400/500. ⚠️ Sem checagem de role. |
| GET/POST | `/api/discord-interactions` | **anônimo (plataforma)** | Webhook de slash-commands do Discord (verificação Ed25519). **Não é para o frontend.** |

## 8. Realtime (SignalR)

- **Conexão:** `GET|POST /api/negotiate` retorna o `connectionInfo` (hub **`tasks`**). O cliente conecta com `new signalR.HubConnectionBuilder().withUrl('/api').build()` (ver `app/js/signalr.js`). Reconnect: `onclose → start`, retry a cada 5s; reconciliação de badge em `window focus`.
- **Eventos servidor → cliente** (broadcast para **todos** os clientes; sem grupos/usuários):

| Evento | Argumento | Emitido por | Ação esperada no cliente |
|---|---|---|---|
| `taskCreated` | `Task` | createTask | adiciona à lista |
| `taskUpdated` | `Task` | updateTask, addComment, deleteComment, signalResponsible, dismissAlert, editComment* | substitui a tarefa na lista |
| `taskDeleted` | `taskId` (string) | deleteTask | remove da lista |
| `tasksReordered` | — (sem args) | updateOrder, updateProjectColor | **refaz** `getTasks` |

- ⚠️ **Bug:** `editComment` emite em `taskUpdated` **no hub `default`**, não no `tasks` — clientes conectados via `negotiate` (hub `tasks`) **não recebem** a edição de comentário em tempo real (precisam de refresh). Corrigir na Fase 1b.
- **Reconciliação (importante preservar no novo front):** em `taskUpdated`, o cliente ignora updates "mais antigos" comparando `notificationStageVersion` e o estado de `pendingAlerts` (um recebimento `acknowledgedAt` é monotônico por sinal) para que acks atrasados não desfaçam uma mudança de status já commitada (lógica TC495 em `signalr.js`).

## 9. Resumo das inconsistências conhecidas (não corrigir aqui)

1. `routeName` (inválido) em `getTasks`/`getUsers`/`getRoles`/`getProjectTaskCounts` → rota cai no nome da pasta. (Fase 1b)
2. `editComment` emite no hub SignalR `default` em vez de `tasks`. (Fase 1b)
3. Endpoints destrutivos/sensíveis sem checagem de role no código (`deleteTask`, `deleteComment`, `updateOrder`, `updateProjectColor`, `uploadAttachment`, `deleteAttachment`, `improveTitle`). (Fase 4)
4. `deleteComment` endereça por índice de array (frágil) enquanto `editComment` endereça por id. (Fase 4)
5. `markNotificationRead`/`updateUserPhoto` fazem escrita sem ETag. (Fase 4)
6. HTML de apresentação gravado em `Task.history`/comentários. (Fase 3)
7. Role legado `travelcash_user` e escopo Google `auth/calendar` não usado. (Fase 4)

> Essas são **comportamento atual** — o novo frontend deve conviver com elas até serem corrigidas nas fases indicadas. O contrato de request/response acima é o alvo a reproduzir.

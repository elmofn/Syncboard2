# API do Agente (acesso direto de máquina) — Fase 2

Permite que um agente de IA (ex.: DOT/GPT) **crie, atualize, comente e consulte
tarefas chamando a API diretamente**, sem dirigir a interface logada. Reaproveita
toda a lógica de domínio (provência, histórico, homologação, concorrência,
realtime) dos endpoints humanos — nada é reimplementado.

## Como funciona (resumo técnico)

O Azure SWA injeta `x-ms-client-principal` após o login Google; `actorEmail(req)`
(em `shared/homologation.js`) usa isso para atribuir toda ação. Agentes não têm
esse login — apresentam uma **chave de API**. Cada endpoint `/api/agent/*` é um
wrapper fino que:

1. valida a chave (`shared/identity.js` → `resolveAgent`);
2. resolve para um usuário **`isAiAgent`** cadastrado;
3. **sintetiza o mesmo `x-ms-client-principal`** daquele usuário;
4. chama **o handler humano** (`getTasks`, `createTask`, `updateTask`, `addComment`).

Resultado: provência/histórico atribuem as ações ao usuário-agente, e **nenhum
validador existente foi alterado**.

## Autenticação

Envie a chave em **um** destes headers:

```
x-agent-key: sb_agent_xxxxxxxx
# ou
Authorization: Bearer sb_agent_xxxxxxxx
```

As rotas `/api/agent/*` são anônimas na plataforma (SWA) e **gated pela chave no
código**. Chave ausente/ inválida → `401`.

## Menor privilégio

- O agente **cria / atualiza / move / comenta / consulta**.
- O agente **não homologa**: `homologationAction`/`homologationRecovery` são
  bloqueados (`403`) e, por construção, a decisão exige o homologador designado
  (humano). Aprovações continuam humanas.
- Sem exclusões, sem gestão de usuários, sem anexos por enquanto.

## Endpoints

Base: `https://syncboard.travelcash.me`

| Método | Rota | Ação |
|---|---|---|
| GET | `/api/agent/tasks` | Lista todas as tarefas |
| GET | `/api/agent/users` | Lista usuários (para e-mails válidos de responsável) |
| POST | `/api/agent/tasks` | Cria tarefa |
| PUT | `/api/agent/tasks/{id}` | Atualiza (mover, progresso, status, responsáveis) |
| POST | `/api/agent/tasks/{id}/comments` | Comenta na tarefa |

Os payloads seguem o contrato humano (ver `docs/API.md`). Exemplos:

**Criar tarefa**
```http
POST /api/agent/tasks
x-agent-key: sb_agent_xxxx
Content-Type: application/json

{ "title": "Revisar fluxo X", "description": "...", "responsible": [{"email":"ana@travelcash.me","name":"Ana"}], "priority": "Média", "project": "Backend" }
```

**Mover / atualizar progresso** (concorrência otimista: envie `expectedStatus` +
`expectedEtag` do estado que leu; `409` se a tarefa mudou)
```http
PUT /api/agent/tasks/TC-123
{ "status": "inprogress", "progress": 40, "expectedStatus": "todo", "expectedEtag": "\"...\"" }
```

**Comentar** (suporta HTML e menções `@`, conforme o contrato)
```http
POST /api/agent/tasks/TC-123/comments
{ "text": "Avancei na parte de autenticação." }
```

Contrato de ferramentas (function-calling / OpenAPI) em
[`agent-openapi.yaml`](./agent-openapi.yaml) — pode ser importado como tools do
DOT ou envolvido por um servidor MCP fino.

## Gestão de chaves (admin)

Endpoint protegido (exige login SWA de um **admin**):

```http
POST /api/admin/agent-keys      { "email": "dot@travelcash.me" }   → gera/rotaciona; devolve a chave UMA vez
DELETE /api/admin/agent-keys    { "email": "dot@travelcash.me" }   → revoga
```

- O usuário-alvo precisa existir e estar marcado como **agente** (`isAiAgent`).
- Guardamos apenas o **hash** (SHA-256) da chave no doc do usuário
  (`apiKeyHash`) — o valor em claro nunca é relido. Rotacionar = gerar outra
  (invalida a anterior). Esse campo viaja na migração de banco como qualquer
  outro campo do usuário.
- A chave em claro aparece **uma única vez** na resposta. Guarde-a com segurança
  (variável de ambiente do agente / Key Vault).

## Auditoria

Toda ação do agente entra em `assignmentHistory`/`history`/comentários atribuída
ao e-mail do agente, igual a um humano. Para distinguir, o usuário-agente tem
`isAiAgent: true` no cadastro.

## Pendente (próximos passos desta fase)

- **Rate-limit** por chave (ainda não implementado — mitigação atual: revogar a
  chave). Candidato a um guard em `shared/identity.js`.
- Opcional: `GET /api/agent/tasks/{id}` (tarefa única) e um servidor MCP fino.

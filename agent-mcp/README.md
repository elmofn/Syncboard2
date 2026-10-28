# SyncBOARD · Servidor MCP do Agente (DOT)

Expõe a API do agente do SyncBOARD (`/api/agent/*`) como **tools MCP**, para o
**DOT (ChatGPT Dots)** usar via um **conector MCP**. O ChatGPT (nuvem) fala MCP
com este servidor; o servidor fala REST com o SyncBOARD usando a chave do
agente — que **nunca** é exposta ao ChatGPT.

```
DOT (ChatGPT)  --MCP/HTTPS-->  este servidor  --REST (x-agent-key)-->  SyncBOARD
```

Tools: `list_tasks`, `list_users`, `create_task`, `update_task`, `add_comment`.
O agente **não homologa** (bloqueado na API).

---

## Passo a passo

### 0. Pré-requisitos (no SyncBOARD)
1. Fase 2 já em produção (merge na `main`).
2. O usuário do DOT existe no cadastro com **`isAiAgent: true`**.
3. Logado como **admin**, gere a chave do agente:
   ```bash
   curl -X POST https://syncboard.travelcash.me/api/admin/agent-keys \
     -H "Content-Type: application/json" \
     --cookie "<sua sessão SWA>" \
     -d '{"email":"dot@travelcash.me"}'
   ```
   Copie o `apiKey` retornado (aparece **uma única vez**).

   > Mais fácil: logado no SyncBOARD pelo navegador, use o console do DevTools:
   > `fetch('/api/admin/agent-keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'dot@travelcash.me'})}).then(r=>r.json()).then(console.log)`

### 1. Rodar localmente (teste opcional)
```bash
cd agent-mcp
cp .env.example .env     # preencha AGENT_API_KEY e MCP_AUTH_TOKEN
npm install
env $(grep -v '^#' .env | xargs) npm start
# health: curl localhost:8080/health
```

### 2. Gerar o token do conector
O ChatGPT precisa se autenticar neste servidor. Gere um token forte:
```bash
openssl rand -base64 32
```
Guarde — será o `MCP_AUTH_TOKEN` (servidor) **e** o Bearer token do conector (ChatGPT).

### 3. Deploy público (Azure Container Apps)
Precisa ser HTTPS público (o ChatGPT é quem chama). Com a CLI do Azure:
```bash
cd agent-mcp
az containerapp up \
  --name syncboard-mcp \
  --resource-group <SEU_RG> \
  --location <SUA_REGIAO> \
  --source . \
  --ingress external --target-port 8080 \
  --env-vars \
     SYNCBOARD_BASE_URL=https://syncboard.travelcash.me \
     AGENT_API_KEY=<chave_do_passo_0> \
     MCP_AUTH_TOKEN=<token_do_passo_2>
```
No fim, a CLI mostra o FQDN. A **URL do MCP** é:
```
https://<fqdn>/mcp
```
> Boas práticas: depois, mova `AGENT_API_KEY` e `MCP_AUTH_TOKEN` para **secrets**
> do Container App (`az containerapp secret set` + `--env-vars KEY=secretref:nome`).
> Qualquer host Node com HTTPS público serve (Render, Fly.io, etc.) — só aponte as
> mesmas variáveis.

### 4. Registrar como conector no ChatGPT
1. ChatGPT → **Settings → Connectors** (pode exigir **Developer mode**/modo avançado).
2. **Add custom connector (MCP)** / "Novo conector".
3. **URL:** `https://<fqdn>/mcp`
4. **Autenticação:** API Key / Bearer → cole o `MCP_AUTH_TOKEN` do passo 2.
5. Salve. O ChatGPT deve listar as 5 tools.

### 5. Ligar ao DOT + Custom Rules
1. Abra/crie o **Dot** → nas permissões de apps/conectores, habilite o conector **SyncBOARD**.
2. Defina **Custom Rules** por ação, por exemplo:
   - `list_tasks`, `list_users`, `add_comment`, `create_task` → **agir sem pedir**;
   - `update_task` (mover/alterar status/responsáveis) → **pedir aprovação**.
3. O auto-review da OpenAI roda por cima e não desliga.

### 6. Testar
Peça ao DOT:
- "Liste as tarefas em andamento." → deve chamar `list_tasks`.
- "Crie a tarefa 'Revisar X' para a Ana." → `list_users` + `create_task`.
- "Mova a TC-123 para andamento e ponha 50%." → `list_tasks` (pega `_etag`) + `update_task`.

Confira no quadro: a ação aparece no **histórico** atribuída ao usuário-agente, e
o **realtime** atualiza as abas abertas.

---

## Concorrência
`update_task` aceita `expectedStatus` + `expectedEtag`. Oriente o DOT a chamar
`list_tasks` antes de atualizar e repassar esses valores; em conflito o servidor
responde erro e o DOT deve reler e repetir.

## Segurança
- A chave do SyncBOARD fica **só no servidor** (env/secret), nunca no ChatGPT.
- O hop ChatGPT→servidor é protegido por `MCP_AUTH_TOKEN` (Bearer). **Não rode em
  produção sem ele** — o servidor avisa no log se estiver ausente.
- Rotacionar acesso: gere outra chave do agente (passo 0) e atualize `AGENT_API_KEY`;
  ou revogue com `DELETE /api/admin/agent-keys`.

## Nota
A disponibilidade de **conectores MCP customizados para Dots** pode estar em
rollout na OpenAI. Se a opção não aparecer no seu plano, o mesmo contrato
(`docs/agent-openapi.yaml`) funciona como **Action** de um Custom GPT enquanto isso.

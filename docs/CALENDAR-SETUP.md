# Integração Google Agenda — configuração

O botão **"Marcar reunião"** cria o evento de fato no Google Agenda do usuário
(com convites e link do Google Meet), em vez de só abrir o compositor.

Como o Azure Static Web Apps **não guarda o token do Google** do login, o
SyncBOARD usa um fluxo OAuth próprio: na primeira vez, o usuário autoriza o
acesso ao calendário (consentimento "offline"); o backend guarda o
**refresh token cifrado** no doc do usuário no Cosmos e, daí em diante, cria
eventos sozinho.

## O que precisa ser configurado (uma vez)

### 1. Google Cloud Console
No projeto que já contém o `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`:

- **Ativar a API:** *APIs & Services → Library → Google Calendar API → Enable*.
- **OAuth consent screen:** adicionar o escopo
  `https://www.googleapis.com/auth/calendar.events`.
  (Se o app estiver em "Testing", adicione os usuários em *Test users*.)
- **Credenciais → o OAuth Client ID existente → Authorized redirect URIs:**
  adicionar exatamente a URL de callback:

  ```
  https://SEU-DOMINIO-SWA/api/calendar/callback
  ```

  Ex.: `https://purple-forest-04967e110.azurestaticapps.net/api/calendar/callback`
  (e também o domínio custom, se houver).

### 2. Azure — App settings da Static Web App
Em *Static Web App → Configuration* (as mesmas settings que já guardam `CosmosDB`,
`GOOGLE_CLIENT_ID`, etc.):

| Setting | Valor |
|---|---|
| `CALENDAR_TOKEN_KEY` | uma string secreta longa e aleatória (ex.: `openssl rand -base64 48`). Cifra os refresh tokens; **não troque depois**, senão todos precisam reconectar. |
| `CALENDAR_REDIRECT_URI` | *(opcional, recomendado)* a mesma URL de callback registrada acima. Se ausente, é derivada do host da requisição. |

`GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` já existem e são reaproveitados.

## Como funciona em uso

1. Usuário clica **Marcar reunião**.
2. Se a agenda ainda não foi conectada, o backend responde **428** e o front
   abre um popup de consentimento do Google. O usuário autoriza (uma única vez).
3. O usuário clica **Marcar reunião** de novo → o evento é criado na agenda
   "primary" dele, os convidados (responsáveis + homologador + solicitante)
   recebem o convite e um link do Meet é gerado. O SyncBOARD abre o evento numa
   nova aba.

Se o usuário revogar o acesso em `myaccount.google.com/permissions`, a próxima
criação responde 428 e o fluxo de conexão recomeça.

## Endpoints criados (backend)

- `GET  /api/calendar/status`   → `{ connected: boolean }`
- `GET  /api/calendar/authorize`→ 302 para o consentimento do Google
- `GET  /api/calendar/callback` → troca o code, guarda o refresh token cifrado
- `POST /api/createMeeting`     → cria o evento; **428** se não conectado

O `/api/calendar/callback` é **anônimo** na plataforma (o cookie do SWA não
volta do Google em navegação cross-site). A identidade do usuário vem do
`state` assinado por HMAC que o `/authorize` (esse sim autenticado) gerou — ou
seja, só um e-mail que passou pelo login do SWA pode ser gravado. As demais
rotas exigem o login do SWA normalmente.

## Segurança

- Refresh token guardado **cifrado** (AES-256-GCM) com `CALENDAR_TOKEN_KEY`.
- `state` do OAuth é assinado (HMAC) e amarrado ao e-mail do usuário logado,
  com validade de 10 min — impede troca de conta entre usuários.
- Escopo mínimo: `calendar.events` (criar/gerir eventos, não ler a agenda toda).
- O usuário cria reuniões **na própria agenda**; nenhuma credencial de serviço.

# Syncboard — Frontend (`web/`)

Reconstrução do frontend em **React + Vite + TypeScript**, sobre o contrato de API existente (`../docs/API.md`) e o design system Fluxo v2 (`../docs/DESIGN-SYSTEM.md`). Nenhum CSS legado (`app/custom.css`, `*-v2.css`) foi portado — o tema vem só dos tokens em `src/styles/theme.css`.

## Rodar

```bash
cd web
npm install
npm run dev        # modo MOCK (padrão): login e quadro funcionam SEM OAuth/APIs
```

Abra http://localhost:5173. No login, clique em **Entrar com Google** — em modo mock a sessão é simulada e o quadro abre com dados fictícios em memória.

### Modo live (backend real)
```bash
VITE_MODE=live npm run dev
```
Requer o SWA CLI rodando o app + functions (`swa start app --api-location api` na raiz, porta 4280). O Vite encaminha `/api` e `/.auth` para lá. A autenticação usa o Google OAuth nativo do SWA.

## Arquitetura

- `src/lib/config.ts` — seleciona o modo (`mock` | `live`) via `VITE_MODE`.
- `src/lib/api.ts` — fachada única; delega para `api.mock.ts` (memória) ou `api.live.ts` (`/api/*`).
- `src/lib/auth.ts` — `getUserInfo/login/logout`; mock simula a sessão, live usa `/.auth/*`.
- `src/lib/realtime.ts` — mock usa um bus de eventos; live usa SignalR (`@microsoft/signalr`).
- `src/lib/mock/` — store em memória + fixtures (dados fictícios).
- `src/types/api.ts` — tipos do contrato (fonte: `docs/API.md`).
- `src/styles/theme.css` — tokens do design system (única fonte de tema).
- `src/components/` — `Login`, `AppShell`, `Board`, `TaskCard`, `StatusBadge`, `Avatar`.

## Scripts
- `npm run dev` — desenvolvimento (mock por padrão).
- `npm run build` — typecheck + build de produção.
- `npm run lint` — checagem de tipos.

> Escopo atual (passo 1c do roadmap): scaffold + login + quadro Kanban com drag-and-drop, funcionando em modo mock. Lista, detalhe de tarefa, homologação, pessoas e notificações virão nos próximos passos (1f/1g).

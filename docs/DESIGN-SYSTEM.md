# Syncboard — Design System "Fluxo v2" (captura da identidade para o novo frontend)

> **Propósito.** Capturar a identidade visual atual do Syncboard a partir de **fontes limpas** — os tokens oficiais (`app/assets/brand-v2/brand-tokens.json`), os vetores da marca (`app/assets/brand-v2/*.svg`) e os **estilos computados reais** extraídos do pilot de componentes renderizado em Chromium headless — para reconstruí-la no `web/` (React+Vite+TS) **sem portar o CSS poluído** (`custom.css` + `*-v2.css`). Passo 1a' do roadmap. Extração: 2026-10-20.
>
> **Como foi capturado.** Tokens: `brand-tokens.json` (fonte oficial). Valores de componente: renderização headless de `app/ui-v2.html` (o "pilot" Fluxo v2, que usa só `fluxo-v2.css` e não depende de backend) + leitura de `getComputedStyle`, em tema claro e escuro. Login: `app/login.html`. Os valores abaixo são os **efetivamente aplicados** no browser, não transcrição do CSS-fonte.

## 1. Fundamentos (tokens)

Fonte: `brand-tokens.json` → direção **"Fluxo"**. Confirmados batendo com os estilos computados.

### 1.1 Cores de marca (base)
| Token | Hex | Uso |
|---|---|---|
| `ink` | `#111827` | texto principal; fundo escuro; fundo de chip ativo/avatar |
| `accent` | `#D6F46A` | destaque "lima"; texto sobre ink (chip ativo/avatar); botão de destaque |
| `action` | `#244FDB` | ação primária (botões), foco, links; "cobalto" |
| `surface` | `#F5F7FA` | fundo da aplicação (claro) |
| `muted` | `#526174` | texto secundário/metadados |
| `borderStrong` | `#7B8798` | borda de controles (inputs, botão secundário) no tema claro |
| `focus` | `#244FDB` | anel de foco (= action) |

### 1.2 Superfícies (tema claro / tema escuro)
| Papel | Claro | Escuro* |
|---|---|---|
| Fundo app | `#F5F7FA` | `#111827` |
| Painel / card | `#FFFFFF` | `#1B2536` |
| Borda de painel/card | `#DCE2EA` | `#3B4A60` |
| Borda forte (controles) | `#7B8798` | `#91A1B8` |
| Texto principal | `#111827` | `#F5F7FA` |
| Texto secundário (muted/help) | `#526174` | `#B5C1D0` |
| Texto de erro | `#A62A24` | `#FFB6AD` |

\* **Tema escuro é provisório** — o `README` da marca diz que é "proposta de compatibilidade para validação", ainda não homologada. Capturado para referência; tratar como opcional no `web/` até aprovação.

### 1.3 Tipografia
- **Família:** `Plus Jakarta Sans` (Google Fonts), fallback `system-ui, sans-serif`. Pesos usados: 400, 500, 600, 700, 800.
- **Escala** (do token, confirmada no render):
  | Papel | Tamanho | Peso | Line-height | Letter-spacing |
  |---|---|---|---|---|
  | Título (h1) | 28px | 700 | 1.25 (35px) | −0.98px (≈ −0.035em) |
  | Subtítulo (h2) | 20px | 700 | 28px | −0.4px |
  | Corpo (body) | 16px | 400 | 1.6 (25.6px) | normal |
  | Controle (botão/input/label) | 14px | 400 (label/botão 700) | — | normal |
  | Metadado (help/erro/badge/chip) | 12px | 400 (badge/chip 700) | 18px | normal |

### 1.4 Espaçamento, raio, foco, movimento
- **Escala de espaçamento:** `4 · 8 · 12 · 16 · 24 · 32` (px). Padding observado: chip/badge `4px 8px`, botão `8px 16px`, input `12px`, card `16px`, painel `24px`, empty `32px 16px`.
- **Raios:** controle `7px` · card `9px` · painel `12px` (batem com o token exatamente).
- **Foco:** cor `#244FDB`, espessura `3px`, offset `3px`.
- **Movimento:** duração `120ms`; respeitar `prefers-reduced-motion`.

## 2. Marca (ativos limpos)

Fonte: `app/assets/brand-v2/` (kit aprovado por Felipe em 14/10/2026, grafia **SyncBOARD**, sem sufixo "NT"). 13 SVGs, geometria original preservada.

- **Símbolo:** cubo modular isométrico 3×3. Paleta do cubo: estrutura/texto `#111827`, topo `#D6F46A`, face esquerda `#244FDB`, face direita `#F5F7FA`.
- **Assinatura (logo + wordmark):** `logo-primary-light.svg` (texto navy p/ fundo claro), `logo-primary-dark.svg` (texto claro p/ fundo escuro), e versões mono `logo-primary-mono-{light,dark}.svg`. Wordmark "SyncBOARD" em Liberation Sans Bold **convertido em curvas** (independe de fonte instalada). Proporção da assinatura: **413.617 × 96** — preservar.
- **Marca isolada (cubo):** `mark-primary.svg` / `mark-primary-light.svg` (cubo completo), `mark-primary-mono*.svg` (uma cor), `mark-small.svg` / `favicon.svg` (símbolo simplificado para 16–24px), `mark-small-mono*.svg`.
- **Regras de uso:** assinatura a partir de **176px** (mínimo), cubo completo a partir de **32px**, símbolo simplificado abaixo de 32px (mín. 16px). Área livre mínima de 12 unidades (viewBox 96). Não distorcer, girar ou sombrear.
- **Animação:** GIF do cubo (`app/assets/cube-assembly-{128,512}.gif`, com fallback `cube-static-512.png`) usado na splash de carregamento e no login. ⚠️ Hoje embutido em base64 no `login.html` (2.2MB) — no `web/` referenciar como arquivo (otimização da Fase 6).

> **Nota:** há `manifest.json` com hashes SHA-256 dos SVGs. Ao migrar os assets para o `web/`, copiá-los do kit `brand-v2/` sem redesenhar.

## 3. Biblioteca de componentes (valores computados verificados)

Todos herdam a família tipográfica. Cores em hex; valores extraídos do render do pilot.

### 3.1 Botões (`.sb-button`) — 14px/700, radius 7px, padding 8px 16px
| Variante | Fundo | Texto | Borda |
|---|---|---|---|
| Primária (padrão) | `#244FDB` | `#FFFFFF` | — |
| Secundária | `#FFFFFF` (dark: `#111827`) | `#111827` (dark: `#F5F7FA`) | `1px #7B8798` (dark: `#91A1B8`) |
| Destaque (accent) | `#D6F46A` | `#111827` | — |
| Perigo (danger) | `#A62A24` | `#FFFFFF` | — |
| Desabilitado | fundo acinzentado, texto reduzido | — | — |
| Carregando | mostra `.sb-spinner` + texto "Carregando…" | — | — |

### 3.2 Chips de filtro (`.sb-chip`) — 12px/700, radius 7px, padding 4px 8px
- **Ativo** (`aria-pressed="true"`): fundo `#111827`, texto `#D6F46A`.
- **Inativo**: fundo `#EDF1F6`, texto `#495A70`, borda `1px #7B8798` (reutiliza a paleta do status "Fila").

### 3.3 Badges de status (`.sb-badge[data-status]`) — 12px/700, radius 7px, padding 4px 8px
Cada etapa tem um ícone textual + par de cores (fundo / texto). Batem 1:1 com `brand-tokens.json.status`:
| Status (`data-status`) | Rótulo | Fundo | Texto | Ícone |
|---|---|---|---|---|
| `todo` | Fila | `#EDF1F6` | `#495A70` | ○ |
| `stopped` | Parado | `#FFF1DD` | `#8C5000` | Ⅱ |
| `inprogress` | Andamento | `#EAF0FF` | `#214CC8` | → |
| `homologation` | Homologação | `#F2EAFB` | `#713AA3` | ◇ |
| `publication` | Publicação | `#E4F3ED` | `#17674D` | ↗ |
| `error` | Erro | `#FFF0EE` | `#A62A24` | ! |
> Nota de domínio (do próprio pilot): "Publicação" é etapa **ativa**; "Parado" não presume impedimento técnico; a **cor do projeto** é um dado independente do status.

### 3.4 Campos (`.sb-field`)
- **Input/Textarea/Select** (`.sb-input`/`.sb-textarea`/`.sb-select`): fundo `#FFFFFF` (dark `#1B2536`), texto `#111827` (dark `#F5F7FA`), borda `1px #7B8798` (dark `#91A1B8`), radius 7px, padding 12px, fonte 14px/400.
- **Label** (`.sb-label`): 14px/700, cor ink. **Ajuda** (`.sb-help`): 12px/400, muted `#526174` (dark `#B5C1D0`). **Erro** (`.sb-error`): 12px/400, `#A62A24` (dark `#FFB6AD`); input com erro usa `aria-invalid="true"` e borda vermelha.
- **Foco:** anel `#244FDB`, 3px, offset 3px (acessível).

### 3.5 Contêineres e feedback
- **Painel** (`.sb-panel`): fundo branco (dark `#1B2536`), borda `1px #DCE2EA` (dark `#3B4A60`), radius 12px, padding 24px.
- **Card** (`.sb-card`): igual, radius 9px, padding 16px.
- **Avatar** (`.sb-avatar`): círculo (`border-radius: 50%`), fundo `#111827`, iniciais em `#D6F46A`, 40px, fonte 14px/700.
- **Notice** (`.sb-notice`): fundo surface (dark ink), borda forte, radius 9px, padding 16px; variante `--error` com borda/realce vermelho. Spinner (`.sb-spinner`) para carregamento.
- **Empty** (`.sb-empty`): borda **tracejada** forte, radius 9px, padding 32px 16px, com o símbolo da marca + título + metadado.
- **Modal** (`.sb-modal`, `<dialog>`) e **Toast** (`.sb-toast`, `role="status"`, `aria-live="polite"`) existem no pilot; capturar interação no `web/`.

## 4. Telas capturadas

### 4.1 Login (`app/login.html`) — alta fidelidade
Layout **split** em duas colunas:
- **Esquerda (painel escuro `#111827`):** logo (cubo + "SyncBOARD") no topo; cubo grande; headline "Seu trabalho." + "Em sintonia." (segunda linha em **lima `#D6F46A`**); subtítulo muted; rodapé "SyncBOARD · Clareza em cada etapa.".
- **Direita (painel claro):** card branco com chip "Seu espaço de trabalho" (fundo lavanda/azul claro, texto action), título "Bom ter você por aqui.", texto de apoio, **botão "Entrar com Google"** (cobalto `#244FDB`, com o "G" colorido), divisor, nota "Acesso restrito à equipe autorizada.". Botão "Tema" no canto superior direito.
- **Responsivo:** no mobile as colunas empilham (capturado em 390px).

### 4.2 Pilot de componentes (`app/ui-v2.html`)
Showcase completo da biblioteca acima (marca em escala, botões, chips, campos, badges, estado vazio, carregamento/erro, modal, toast), em claro e escuro — é a **referência canônica de componentes** para o `web/`.

## 5. Telas reais (layout) — capturado

Referência em `docs/design-reference/real/` (screenshots do app em produção: `real-lista.webp`, `real-quadro.webp`, `real-detalhe-topo.png`, `real-detalhe-comentarios.png`). O layout real é mais rico que o scaffold inicial — pontos principais:

### 5.1 Shell / navegação — **sidebar à esquerda** (não top-bar)
Coluna fixa à esquerda (fundo escuro `ink`), de cima para baixo:
- **Marca:** cubo + "SyncBOARD".
- **Seletor de WORKSPACE:** avatar/badge + nome ("SyncBoard NT") com dropdown.
- **Seletor de BOARD:** ícone + nome ("Quadro de trabalho") com dropdown.
- **Seção TRABALHO:** Home · Quadro (com badge de contagem, ex. `7`) · Lista · Arquivados. Item ativo destacado em **lima** (`accent`).
- **Seção PROJETOS:** lista de projetos com ponto colorido + nome + contagem `ativas/total` (ex. "SBNT 5/49", "Teste de Capacidade 2/5"). → alimentado por `GET /api/getProjectTaskCounts` (`{project, active, total}`).
- **Seção CONFIGURAÇÃO:** Workspace · Boards · Users.
- **Rodapé:** card do usuário atual (avatar + nome + cargo "Mobile Architect" + ícone de ajustes).

> Workspace/Board aparecem como seletores, mas o backend atual **não tem entidades de workspace/board** — tasks só têm `project` (string). Tratar esses seletores como estrutura de navegação (hoje efetivamente um workspace/board únicos); projetos são derivados de `getProjectTaskCounts`.

### 5.2 Barra superior + cabeçalho + filtros
- **Top bar:** breadcrumb ("Espaço de trabalho / Lista"), à direita **sino de notificações** + avatar do usuário.
- **Cabeçalho:** eyebrow "SYNCBOARD", título (ex. "Lista de tarefas" / "Quadro de trabalho"), subtítulo, e botão **"+ Nova Tarefa"** (cobalto) à direita.
- **Barra de filtros:** busca "Buscar por título ou ID" + selects "Todos os projetos / usuários / prioridades / estados" + "Limpar".
- **Linha de controle:** "N tarefas encontradas", ordenação (ex. "Criação · decrescente") e **toggle de visão Quadro | Lista**.

### 5.3 Quadro (Kanban)
- Colunas por status com ícone + nome + **contagem** e **borda superior colorida** por status (Fila cinza, Parado laranja, Andamento azul, Homologação roxo, Publicação verde).
- **Card:** `TC-id` · prioridade (bandeira + "Média") · prazo ("Sem prazo") · menu "…"; **título**; chip do projeto (ponto + nome); **"Progresso informado"** com barra + `%`; rodapé com **avatares em fluxo** (responsável/encaminhamentos: `avatar → avatar → avatar`) e **contador de comentários** (💬 N).
- Coluna vazia: "Nenhuma tarefa nesta etapa." (tracejado).

### 5.4 Lista (tabela)
Colunas: **Tarefa** (TC-id · projeto, título, "Criação: data · N anexos") · **Estado** (badge) · **Solicitante** · **Responsáveis** · **Homologador** ("Não informado" quando ausente) · **Prioridade** (bandeira) · **Prazo** · **Progresso** (barra + %) · ação de excluir (lixeira).

### 5.5 Detalhe da tarefa (modal, 2 colunas)
- **Cabeçalho:** chip `#TC-id` + chip de status; botão X.
- **Coluna esquerda (conteúdo):** título; blocos com **borda colorida à esquerda**: "Descrição da Tarefa" (verde), "Atualização de Progresso" (azul, com badge de %), "Orientação de Continuidade" (roxo — `continuityInstructions`). Abaixo, **abas**: **Comentários (N) · Anexos (N) · Histórico**. Comentários têm editor rich-text (toolbar B/I/U/lista), placeholder "Escreva um comentário (use @ para mencionar)…", botão enviar (avião cobalto) e botão "Adicionar" (anexo); texto de ajuda ("Enter envia; Shift+Enter…").
- **Coluna direita ("Resumo"):** Projeto (chip), Prioridade, Prazo; **"Fluxo"** = timeline vertical (Solicitante → Responsável → Responsável principal → Homologador) com carimbos de data e marcações como "Atenção solicitada" — montado de `requester` + `assignmentHistory` + `pendingAlerts` + `homologador`. Barra de **Progresso %**. Ações: **"Marcar reunião"** e **"Chamar atenção"** (= `signalResponsible`).
- **Rodapé:** "Alterações e comentários usam as ações desta tarefa." · **Fechar** · **Editar tarefa** (cobalto).

### 5.5.1 Detalhe — abas, histórico, ações e edição (prints adicionais)
Referência: `real-detalhe-historico.png`, `real-detalhe-homologacao.png`, `real-detalhe-editar.png`, `real-detalhe-anexos.png`.
- **Aba Histórico:** timeline (mais recente no topo). Cada item = ícone redondo por tipo (lápis = `edited`, megafone = `attention_requested`, "+" = `created`), texto da ação em negrito (status/nomes em bold), sub-linhas (ex.: "Responsável pela continuidade: …", "Orientação de continuidade: …", "Editou: Responsáveis") e carimbo (data, hora). Vem de `task.history` (`description` em HTML com `<br>`).
- **Aba Anexos:** cada anexo = ícone de arquivo + nome + legenda ("Vinculado à tarefa" ou "Arquivo com link") + botão visualizar (olho); no modo edição também excluir (lixeira).
- **Ações (coluna direita) por status:**
  - `homologation`: **Aprovar** (cobalto), **Encaminhar** (secundário), **Reprovar** (contorno vermelho) — mapeiam para `updateTask` com `homologationAction` approve/forward/reject. Encaminhar pede novo responsável + orientação.
  - demais status: **Chamar atenção** (= `signalResponsible`) e **Marcar reunião** (calendário — a confirmar).
- **Editar tarefa** (botão no rodapé) abre um **formulário** (print `real-detalhe-editar.png`): Título (+ "Melhorar título com IA" = `improveTitle`), Descrição, Anexos (+ Adicionar); coluna direita: Link DevOps/externo (`azureLink`), Responsáveis (chips; o primeiro é o principal), Status, Projeto (+ seletor de cor → `updateProjectColor`), Prioridade, Prazo (+ "Sem data"). Rodapé: Cancelar / Salvar Tarefa. → próximo passo após o detalhe.

### 5.6 Pontos novos observados (contrato/dados)
- **`progress`** (0–100) existe na tarefa (barra "Progresso"; `updateTask` seta `progress:100` ao aprovar homologação). Documentar como campo no `docs/API.md` (adendo da Fase 1b).
- **"Marcar reunião"** sugere integração de **calendário** — reconcilia o escopo Google `auth/calendar` (que eu havia marcado como "não usado"); confirmar se cria evento (pode ser feature parcial/planejada).
- **"Chamar atenção"** = `POST /api/signalResponsible/{id}`; o selo de alerta no card/fluxo = `pendingAlerts`.
- Card/linha mostram **contagem de anexos** e **de comentários** (derivados dos arrays embutidos).
- **Fluxo de responsáveis (card e Resumo):** derivado de `requester` + `assignmentHistory`. 1º = **Solicitante** (quem criou; ausente → "Não registrado"/NR). Depois a **cadeia de responsáveis** ao longo do tempo (cada passo = o conjunto de responsáveis daquele momento); troca de responsável vira uma **seta** para o próximo; responsáveis simultâneos aparecem **agrupados** (avatares sobrepostos). O passo atual é destacado e o primeiro dele é "Responsável principal". Quando há troca anterior ao primeiro registro (`assignmentHistory[0].from` não vazio), mostra "Histórico parcial: trocas anteriores não registradas". Por fim o **Homologador** (ausente → "Não informado"/NI). No card, o fluxo é compacto (solicitante … últimos passos com seta).

### 5.7 Ainda sem referência (opcional)
Home, Pessoas (Users), Arquivados, painel de Notificações (conteúdo do sino) e os seletores de Workspace/Board abertos. Não bloqueiam o avanço; peço quando chegarmos nessas telas.

## 6. Próximo uso (no `web/`)
Estes tokens viram a única fonte de tema (CSS vars + config do Tailwind), e os componentes acima viram os primeiros componentes React. Nenhuma linha de `custom.css`/`*-v2.css` é portada — reproduz-se a partir destes valores + da referência renderizada.

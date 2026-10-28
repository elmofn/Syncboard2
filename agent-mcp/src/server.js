// Servidor MCP (Streamable HTTP) que expõe a API do agente do SyncBOARD como
// tools, para o DOT/ChatGPT. O ChatGPT (nuvem) fala MCP com este servidor; o
// servidor fala REST com o SyncBOARD usando a chave do agente (nunca exposta ao
// ChatGPT). Proteja o hop ChatGPT→servidor com MCP_AUTH_TOKEN.

import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

const BASE = (process.env.SYNCBOARD_BASE_URL || "").replace(/\/$/, "");
const KEY = process.env.AGENT_API_KEY || "";
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || "";
const PORT = Number(process.env.PORT || 8080);

if (!BASE || !KEY) {
  console.error("Faltam variáveis: SYNCBOARD_BASE_URL e/ou AGENT_API_KEY.");
  process.exit(1);
}
if (!MCP_AUTH_TOKEN) {
  console.warn("[AVISO] MCP_AUTH_TOKEN não definido: o servidor fica ABERTO. Defina-o em produção.");
}

// --- Cliente REST do SyncBOARD ---
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "x-agent-key": KEY,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data === "string" && data ? data : (data && data.message) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

// --- Trimming (respostas enxutas para o modelo) ---
const emails = (arr) => (Array.isArray(arr) ? arr.map((p) => (typeof p === "object" ? p.email : p)).filter(Boolean) : []);
const oneEmail = (p) => (p ? (typeof p === "object" ? p.email : p) : null);
function trimTask(t) {
  if (!t || typeof t !== "object") return t;
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    progress: t.progress,
    missingToComplete: t.missingToComplete,
    project: t.project,
    responsible: emails(t.responsible),
    homologador: oneEmail(t.homologador),
    dueDate: t.dueDate,
    _etag: t._etag, // necessário para updates concorrentes-seguros
  };
}
const ok = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
function fail(e) {
  let hint = "";
  if (e.status === 409) hint = " (conflito: chame list_tasks de novo para obter status/_etag atuais e repita)";
  else if (e.status === 401) hint = " (chave do agente inválida/ausente no servidor MCP)";
  else if (e.status === 403) hint = " (ação não permitida ao agente — ex.: homologar)";
  return { content: [{ type: "text", text: `Erro ${e.status || ""}: ${e.message}${hint}` }], isError: true };
}

// --- Monta um McpServer com as tools do SyncBOARD ---
function buildServer() {
  const server = new McpServer({ name: "syncboard-agent", version: "1.0.0" });

  server.registerTool(
    "list_tasks",
    {
      title: "Listar tarefas",
      description: "Lista as tarefas do SyncBOARD. Use para obter id, status e _etag antes de atualizar.",
      inputSchema: {
        status: z.string().optional().describe("Filtra por status: todo|stopped|inprogress|homologation|publication|done"),
        project: z.string().optional().describe("Filtra por nome do projeto"),
      },
    },
    async ({ status, project }) => {
      try {
        let tasks = await api("/api/agent/tasks");
        if (!Array.isArray(tasks)) tasks = [];
        if (status) tasks = tasks.filter((t) => t.status === status);
        if (project) tasks = tasks.filter((t) => (t.project || "").toLowerCase() === project.toLowerCase());
        return ok(tasks.map(trimTask));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_users",
    {
      title: "Listar usuários",
      description: "Lista usuários cadastrados (e-mails válidos para responsável/homologador).",
      inputSchema: {},
    },
    async () => {
      try {
        const users = await api("/api/agent/users");
        const trimmed = (Array.isArray(users) ? users : []).map((u) => ({
          email: u.email,
          name: u.name || u.displayName,
          role: u.role,
          isAiAgent: u.isAiAgent === true,
        }));
        return ok(trimmed);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "create_task",
    {
      title: "Criar tarefa",
      description: "Cria uma tarefa. O agente é registrado como solicitante/criador.",
      inputSchema: {
        title: z.string().describe("Título da tarefa"),
        description: z.string().optional(),
        responsible: z
          .array(z.object({ email: z.string(), name: z.string().optional() }))
          .describe("Responsáveis (e-mails válidos de list_users)"),
        priority: z.enum(["Baixa", "Média", "Alta"]).optional(),
        project: z.string().optional(),
        projectColor: z.string().optional(),
        homologador: z.object({ email: z.string(), name: z.string().optional() }).optional(),
        dueDate: z.string().nullable().optional(),
      },
    },
    async (args) => {
      try {
        const task = await api("/api/agent/tasks", { method: "POST", body: args });
        return ok(trimTask(task));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "update_task",
    {
      title: "Atualizar tarefa",
      description:
        "Atualiza uma tarefa (mover, progresso, status, responsáveis). Para segurança concorrente, passe expectedStatus e expectedEtag obtidos em list_tasks. O agente NÃO pode homologar.",
      inputSchema: {
        id: z.string().describe("ID da tarefa (ex.: TC-123)"),
        status: z.enum(["todo", "stopped", "inprogress", "homologation", "publication", "done"]).optional(),
        progress: z.number().min(0).max(100).optional(),
        missingToComplete: z.string().optional(),
        responsible: z.array(z.object({ email: z.string(), name: z.string().optional() })).optional(),
        priority: z.string().optional(),
        project: z.string().optional(),
        dueDate: z.string().nullable().optional(),
        expectedStatus: z.string().optional().describe("Status atual lido (concorrência)"),
        expectedEtag: z.string().optional().describe("_etag atual lido (concorrência)"),
      },
    },
    async ({ id, ...patch }) => {
      try {
        const body = {};
        for (const [k, v] of Object.entries(patch)) if (v !== undefined) body[k] = v;
        const task = await api(`/api/agent/tasks/${encodeURIComponent(id)}`, { method: "PUT", body });
        return ok(trimTask(task));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "add_comment",
    {
      title: "Comentar na tarefa",
      description: "Adiciona um comentário à tarefa (atribuído ao agente). Aceita HTML e menções @ conforme o contrato.",
      inputSchema: {
        id: z.string().describe("ID da tarefa"),
        text: z.string().describe("Texto do comentário (HTML permitido)"),
      },
    },
    async ({ id, text }) => {
      try {
        await api(`/api/agent/tasks/${encodeURIComponent(id)}/comments`, { method: "POST", body: { text } });
        return ok({ ok: true, taskId: id });
      } catch (e) {
        return fail(e);
      }
    },
  );

  return server;
}

// --- HTTP (Streamable HTTP + sessões) ---
const app = express();
app.use(express.json({ limit: "1mb" }));

// Auth do hop ChatGPT→servidor.
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (!MCP_AUTH_TOKEN) return next();
  const auth = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(String(auth).trim());
  if (!m || m[1] !== MCP_AUTH_TOKEN) {
    return res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
  }
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const transports = {}; // sessionId -> transport

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  let transport;
  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };
    await buildServer().connect(transport);
  } else {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request: no valid session ID" }, id: null });
    return;
  }
  await transport.handleRequest(req, res, req.body);
});

async function sessionRequest(req, res) {
  const sessionId = req.headers["mcp-session-id"];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
}
app.get("/mcp", sessionRequest);
app.delete("/mcp", sessionRequest);

app.listen(PORT, () => {
  console.log(`SyncBOARD MCP em :${PORT} → ${BASE}  (auth ${MCP_AUTH_TOKEN ? "ON" : "OFF"})`);
});

// Identidade de máquina (agentes de IA) para a superfície /api/agent/*.
//
// Os endpoints humanos confiam no header x-ms-client-principal que o Azure SWA
// injeta após o login Google. Agentes não têm esse login; em vez disso
// apresentam uma CHAVE DE API. Aqui resolvemos a chave para um usuário
// isAiAgent cadastrado e SINTETIZAMOS o mesmo principal confiável, para que
// todo o domínio (provência, histórico, homologação, concorrência) atribua as
// ações ao usuário-agente SEM alterar nenhum validador existente.

const crypto = require("crypto");
const { CosmosClient } = require("@azure/cosmos");

const usersContainer = new CosmosClient(process.env.CosmosDB)
  .database("TasksDB")
  .container("Users");

function normEmail(value) {
  if (typeof value !== "string") return null;
  const n = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n) ? n : null;
}

/** Hash (hex) de uma chave de API. Só o hash é guardado no doc do usuário. */
function hashKey(key) {
  return crypto.createHash("sha256").update(String(key)).digest("hex");
}

/** Extrai a chave do header x-agent-key ou de Authorization: Bearer <chave>. */
function extractKey(req) {
  const h = req.headers || {};
  const direct = h["x-agent-key"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const auth = h["authorization"] || h["Authorization"];
  if (typeof auth === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Resolve a requisição para um agente cadastrado (isAiAgent) pela chave de API.
 * Devolve { email, name } ou null se a chave for ausente/inválida.
 */
async function resolveAgent(req) {
  const key = extractKey(req);
  if (!key) return null;
  const hash = hashKey(key);
  const { resources } = await usersContainer.items
    .query({
      query: "SELECT * FROM c WHERE c.apiKeyHash = @h AND c.isAiAgent = true",
      parameters: [{ name: "@h", value: hash }],
    })
    .fetchAll();
  const user = resources[0];
  const email = user && normEmail(user.email);
  if (!email) return null;
  return { email, name: user.name || user.displayName || email };
}

/**
 * Injeta no req o mesmo x-ms-client-principal que o SWA produziria para esse
 * usuário, com a role travelcash_user (exigida por actorEmail). A partir daí o
 * handler humano roda como se o agente estivesse logado.
 */
function injectPrincipal(req, agent) {
  const principal = {
    identityProvider: "agent",
    userId: agent.email,
    userDetails: agent.email,
    userRoles: ["authenticated", "travelcash_user"],
    claims: [{ typ: "name", val: agent.name }],
  };
  req.headers = req.headers || {};
  req.headers["x-ms-client-principal"] = Buffer.from(JSON.stringify(principal)).toString("base64");
}

/**
 * Porta de entrada dos wrappers: resolve o agente e injeta o principal. Em caso
 * de chave inválida, escreve 401 em context.res e devolve null.
 */
async function requireAgent(context, req) {
  const agent = await resolveAgent(req);
  if (!agent) {
    context.res = { status: 401, body: "Chave de agente ausente ou inválida." };
    return null;
  }
  injectPrincipal(req, agent);
  return agent;
}

module.exports = { normEmail, hashKey, extractKey, resolveAgent, injectPrincipal, requireAgent, usersContainer };

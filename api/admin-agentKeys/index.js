const crypto = require("crypto");
const identity = require("../shared/identity");
const { actorEmail, registeredProfile } = require("../shared/homologation");

const usersContainer = identity.usersContainer;

// POST   /api/admin/agent-keys  { email }  → gera/rotaciona a chave do agente;
//                                            devolve a chave UMA vez.
// DELETE /api/admin/agent-keys  { email }  → revoga a chave do agente.
//
// Rota sob /* (exige login SWA) + checagem de admin no código. Guardamos só o
// hash da chave no doc do usuário; o valor em claro nunca é relido.
module.exports = async function (context, req) {
  // Porta de admin (humano), mesmo padrão de recoveryUpdate.
  const actor = actorEmail(req);
  let principal = null;
  try {
    principal = actor && JSON.parse(Buffer.from(req.headers["x-ms-client-principal"], "base64").toString("utf8"));
  } catch (_) {
    principal = null;
  }
  const profile = actor ? await registeredProfile(actor, usersContainer) : null;
  if (!actor || !principal || !Array.isArray(principal.userRoles) || !principal.userRoles.includes("admin") || profile?.isAdmin !== true) {
    context.res = { status: 403, body: "Somente administradores podem gerir chaves de agente." };
    return;
  }

  const targetEmail = identity.normEmail(req.body && req.body.email);
  if (!targetEmail) {
    context.res = { status: 400, body: "Informe o e-mail do agente (email)." };
    return;
  }
  const { resource: target } = await usersContainer
    .item(targetEmail, targetEmail)
    .read()
    .catch(() => ({ resource: null }));
  if (!target) {
    context.res = { status: 404, body: "Usuário não encontrado." };
    return;
  }
  if (target.isAiAgent !== true) {
    context.res = { status: 400, body: "O usuário não é um agente (isAiAgent). Marque-o como agente antes de gerar a chave." };
    return;
  }

  if (req.method === "DELETE") {
    await usersContainer.item(targetEmail, targetEmail).patch({ operations: [{ op: "set", path: "/apiKeyHash", value: "" }] });
    context.res = { headers: { "Content-Type": "application/json" }, body: { email: targetEmail, revoked: true } };
    return;
  }

  const key = "sb_agent_" + crypto.randomBytes(32).toString("base64url");
  await usersContainer.item(targetEmail, targetEmail).patch({
    operations: [
      { op: "set", path: "/apiKeyHash", value: identity.hashKey(key) },
      { op: "set", path: "/apiKeyUpdatedAt", value: new Date().toISOString() },
    ],
  });
  context.res = {
    headers: { "Content-Type": "application/json" },
    body: {
      email: targetEmail,
      apiKey: key,
      note: "Guarde esta chave agora — ela não será exibida novamente. Gere outra para rotacionar.",
    },
  };
};

const identity = require("../shared/identity");
const inner = require("../updateTask");

// PUT /api/agent/tasks/{id} → atualiza a tarefa (mover, progresso, status,
// responsáveis, comentários via campos do contrato). Reusa updateTask.
//
// Menor privilégio: o agente NÃO homologa. Bloqueamos a decisão de homologação
// aqui; e, por construção, decisionUpdate já exige que o ator seja o
// homologador designado (humano), então a aprovação permanece humana.
module.exports = async function (context, req) {
  if (!(await identity.requireAgent(context, req))) return;
  const body = req.body || {};
  if (body.homologationAction !== undefined || body.homologationRecovery !== undefined) {
    context.res = { status: 403, body: "O agente não pode homologar nem recuperar homologação." };
    return;
  }
  await inner(context, req);
};

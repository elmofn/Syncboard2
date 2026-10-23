const identity = require("../shared/identity");
const inner = require("../createTask");

// POST /api/agent/tasks → cria tarefa (reusa createTask). A provência registra
// o agente como solicitante/criador.
module.exports = async function (context, req) {
  if (!(await identity.requireAgent(context, req))) return;
  await inner(context, req);
};

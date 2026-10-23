const identity = require("../shared/identity");
const inner = require("../addComment");

// POST /api/agent/tasks/{id}/comments → comenta na tarefa (reusa addComment). O
// comentário é atribuído ao usuário-agente. Menções/anexos seguem o contrato.
module.exports = async function (context, req) {
  if (!(await identity.requireAgent(context, req))) return;
  await inner(context, req);
};

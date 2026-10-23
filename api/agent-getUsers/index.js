const identity = require("../shared/identity");
const inner = require("../getUsers");

// GET /api/agent/users → lista usuários (reusa getUsers). O agente precisa
// disso para saber e-mails válidos de responsável/homologador.
module.exports = async function (context, req) {
  if (!(await identity.requireAgent(context, req))) return;
  await inner(context, req);
};

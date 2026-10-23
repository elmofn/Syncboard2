const identity = require("../shared/identity");
const inner = require("../getTasks");

// GET /api/agent/tasks → lista tarefas (reusa getTasks).
module.exports = async function (context, req) {
  if (!(await identity.requireAgent(context, req))) return;
  await inner(context, req);
};

const cal = require("../shared/calendar");

// Informa se o usuário logado já conectou o Google Agenda (tem refresh token).
module.exports = async function (context, req) {
  const email = cal.getEmail(cal.getPrincipal(req));
  if (!email) {
    context.res = { status: 401, body: "Não autenticado." };
    return;
  }
  try {
    const token = await cal.getRefreshToken(email);
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { connected: !!token },
    };
  } catch (e) {
    context.log.error(`calendar/status: ${e.message}`);
    // Config ausente (ex.: CALENDAR_TOKEN_KEY) → trata como não conectado.
    context.res = { headers: { "Content-Type": "application/json" }, body: { connected: false } };
  }
};

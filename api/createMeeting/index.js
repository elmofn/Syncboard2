const { randomUUID } = require("crypto");
const cal = require("../shared/calendar");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cria um evento no Google Agenda (agenda "primary") do usuário logado, usando o
// refresh token guardado. Convida os participantes informados e, opcionalmente,
// gera um link do Google Meet. Responde 428 quando a agenda não está conectada,
// para o frontend disparar o fluxo de conexão.
module.exports = async function (context, req) {
  const email = cal.getEmail(cal.getPrincipal(req));
  if (!email) {
    context.res = { status: 401, body: "Não autenticado." };
    return;
  }

  const body = req.body || {};
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    context.res = { status: 400, body: "Título da reunião é obrigatório." };
    return;
  }
  const start = body.start && !isNaN(Date.parse(body.start)) ? new Date(body.start) : null;
  const end = body.end && !isNaN(Date.parse(body.end)) ? new Date(body.end) : null;
  if (!start || !end || end <= start) {
    context.res = { status: 400, body: "Janela de início/fim inválida." };
    return;
  }
  const attendees = Array.isArray(body.attendees)
    ? [...new Set(body.attendees.map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))]
    : [];
  const description = typeof body.description === "string" ? body.description : "";
  const addMeet = body.addMeet !== false; // Meet por padrão

  let refreshToken;
  try {
    refreshToken = await cal.getRefreshToken(email);
  } catch (e) {
    context.log.error(`createMeeting config: ${e.message}`);
    context.res = { status: 500, body: e.message };
    return;
  }
  if (!refreshToken) {
    context.res = {
      status: 428,
      headers: { "Content-Type": "application/json" },
      body: { error: "not_connected" },
    };
    return;
  }

  try {
    const client = cal.oauthClient(req);
    client.setCredentials({ refresh_token: refreshToken });
    const calendar = cal.google.calendar({ version: "v3", auth: client });

    const requestBody = {
      summary: title,
      description,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: attendees.map((e) => ({ email: e })),
    };
    if (addMeet) {
      requestBody.conferenceData = {
        createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
      };
    }

    const { data } = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: "all",
      conferenceDataVersion: addMeet ? 1 : 0,
      requestBody,
    });

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { htmlLink: data.htmlLink, hangoutLink: data.hangoutLink || null, id: data.id },
    };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    // Refresh token revogado/expirado → limpa e pede reconexão.
    if (/invalid_grant|unauthorized_client|invalid_credentials/i.test(msg)) {
      await cal.clearRefreshToken(email);
      context.res = { status: 428, headers: { "Content-Type": "application/json" }, body: { error: "not_connected" } };
      return;
    }
    context.log.error(`createMeeting: ${msg}`);
    context.res = { status: 500, body: "Falha ao criar a reunião no Google Agenda." };
  }
};

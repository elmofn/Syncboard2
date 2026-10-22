const cal = require("../shared/calendar");

// Inicia o consentimento OAuth do Google Agenda para o usuário logado.
// Redireciona o navegador (popup) para a tela de consentimento do Google.
module.exports = async function (context, req) {
  const email = cal.getEmail(cal.getPrincipal(req));
  if (!email) {
    context.res = { status: 401, body: "Não autenticado." };
    return;
  }

  try {
    const client = cal.oauthClient(req);
    const url = client.generateAuthUrl({
      access_type: "offline", // garante refresh_token
      prompt: "consent", // reemite o refresh_token mesmo se já consentido
      include_granted_scopes: true,
      scope: cal.SCOPES,
      state: cal.signState(email),
    });
    context.res = { status: 302, headers: { Location: url } };
  } catch (e) {
    context.log.error(`calendar/authorize: ${e.message}`);
    context.res = { status: 500, body: e.message };
  }
};

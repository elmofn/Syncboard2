const cal = require("../shared/calendar");

function page(title, message, ok) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0f1115;color:#e7e9ee;
       display:flex;min-height:100vh;align-items:center;justify-content:center}
  .box{max-width:420px;padding:32px;text-align:center}
  .badge{width:56px;height:56px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;
         justify-content:center;font-size:28px;background:${ok ? "#113524" : "#3a1414"};color:${ok ? "#34d399" : "#f87171"}}
  h1{font-size:18px;margin:0 0 8px} p{color:#9aa1ad;margin:0 0 20px;font-size:14px;line-height:1.5}
  button{background:#244FDB;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;cursor:pointer}
</style></head><body><div class="box">
  <div class="badge">${ok ? "&#10003;" : "&#33;"}</div>
  <h1>${title}</h1><p>${message}</p>
  <button onclick="window.close()">Fechar janela</button>
  <script>setTimeout(function(){try{window.close();}catch(e){}}, ${ok ? 1200 : 4000});</script>
</div></body></html>`;
}

// Recebe o retorno do Google, troca o code por tokens e guarda o refresh_token
// (cifrado) no doc do usuário logado. Responde com uma página que fecha o popup.
module.exports = async function (context, req) {
  const html = (title, msg, ok, status) => {
    context.res = { status: status || 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: page(title, msg, ok) };
  };

  if (req.query.error) {
    html("Permissão negada", "Você não autorizou o acesso ao Google Agenda.", false, 400);
    return;
  }
  const code = req.query.code;
  if (!code) {
    html("Retorno inválido", "O Google não retornou o código de autorização.", false, 400);
    return;
  }
  // Rota anônima: o cookie do SWA não volta do Google (cross-site). A identidade
  // vem do state assinado (HMAC), produzido pelo /authorize já autenticado.
  const parsed = cal.readState(req.query.state);
  if (!parsed) {
    html("Estado inválido", "A sessão de autorização expirou. Tente conectar novamente.", false, 400);
    return;
  }
  const email = parsed.email;

  try {
    const client = cal.oauthClient(req);
    const { tokens } = await client.getToken(code);
    if (!tokens || !tokens.refresh_token) {
      // Sem refresh_token: o Google só o reenvia com prompt=consent (que usamos).
      // Se mesmo assim faltar, o usuário já tinha concedido sem offline antes.
      const existing = await cal.getRefreshToken(email);
      if (!existing) {
        html(
          "Não foi possível concluir",
          "O Google não devolveu um token de atualização. Remova o acesso do SyncBOARD em myaccount.google.com/permissions e conecte novamente.",
          false,
          400,
        );
        return;
      }
      html("Google Agenda conectado", "Tudo certo. Pode voltar ao SyncBOARD.", true);
      return;
    }
    await cal.saveRefreshToken(email, tokens.refresh_token);
    html("Google Agenda conectado", "Pronto! Agora o SyncBOARD pode criar reuniões na sua agenda.", true);
  } catch (e) {
    context.log.error(`calendar/callback: ${e.message}`);
    html("Falha na conexão", "Não foi possível concluir a conexão com o Google Agenda.", false, 500);
  }
};

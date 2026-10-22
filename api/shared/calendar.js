// Integração com o Google Agenda (criação de eventos via API).
//
// O Azure Static Web Apps NÃO tem token store: o access/refresh token do Google
// obtido no login da plataforma é descartado e nunca chega às Functions. Por
// isso usamos um fluxo OAuth próprio (consentimento "offline" uma vez por
// usuário) e guardamos o refresh_token — cifrado — no doc do usuário no Cosmos.
// A partir daí o backend renova o access token sozinho e cria eventos.

const crypto = require("crypto");
const { google } = require("googleapis");
const { CosmosClient } = require("@azure/cosmos");

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

const connectionString = process.env.CosmosDB;
const client = new CosmosClient(connectionString);
const usersContainer = client.database("TasksDB").container("Users");

// --- Identidade (principal do SWA via header) ---
function getPrincipal(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function getEmail(principal) {
  if (!principal) return null;
  const claims = Array.isArray(principal.claims) ? principal.claims : [];
  const byType = (t) => (claims.find((c) => c.typ === t) || {}).val;
  const email =
    principal.userDetails ||
    byType("email") ||
    byType("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress");
  return email ? String(email).toLowerCase() : null;
}

// --- Config / OAuth client ---
function requireConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados.");
  }
  if (!process.env.CALENDAR_TOKEN_KEY) {
    throw new Error("CALENDAR_TOKEN_KEY não configurada (cifra do refresh token).");
  }
  return { clientId, clientSecret };
}

// O redirect URI precisa casar EXATAMENTE com o registrado no Google Cloud
// Console. Preferimos a app setting; caímos para a derivação a partir do host.
function getRedirectUri(req) {
  if (process.env.CALENDAR_REDIRECT_URI) return process.env.CALENDAR_REDIRECT_URI;
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}/api/calendar/callback`;
}

function oauthClient(req) {
  const { clientId, clientSecret } = requireConfig();
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri(req));
}

// --- Cifra simétrica do refresh token (AES-256-GCM) ---
function key() {
  return crypto.createHash("sha256").update(process.env.CALENDAR_TOKEN_KEY || "").digest();
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}
function decrypt(b64) {
  const raw = Buffer.from(b64, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// --- State assinado (liga o consentimento ao usuário; anti-CSRF) ---
function signState(email) {
  const payload = Buffer.from(JSON.stringify({ e: email, t: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", key()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifyState(state, email) {
  if (!state || typeof state !== "string" || !state.includes(".")) return false;
  const [payload, sig] = state.split(".");
  const expected = crypto.createHmac("sha256", key()).update(payload).digest("base64url");
  if (sig !== expected) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.e !== email) return false;
    if (Date.now() - data.t > 10 * 60 * 1000) return false; // 10 min
    return true;
  } catch {
    return false;
  }
}

// --- Persistência do refresh token no doc do usuário ---
async function saveRefreshToken(email, refreshToken) {
  await usersContainer.item(email, email).patch({
    operations: [
      { op: "set", path: "/calendarRefreshToken", value: encrypt(refreshToken) },
      { op: "set", path: "/calendarConnectedAt", value: new Date().toISOString() },
    ],
  });
}

async function getRefreshToken(email) {
  const { resource } = await usersContainer
    .item(email, email)
    .read()
    .catch(() => ({ resource: null }));
  if (!resource || !resource.calendarRefreshToken) return null;
  try {
    return decrypt(resource.calendarRefreshToken);
  } catch {
    return null; // chave trocada / dado corrompido → tratar como não conectado
  }
}

async function clearRefreshToken(email) {
  await usersContainer
    .item(email, email)
    .patch({ operations: [{ op: "set", path: "/calendarRefreshToken", value: "" }] })
    .catch(() => {});
}

module.exports = {
  SCOPES,
  getPrincipal,
  getEmail,
  requireConfig,
  getRedirectUri,
  oauthClient,
  signState,
  verifyState,
  saveRefreshToken,
  getRefreshToken,
  clearRefreshToken,
  google,
};

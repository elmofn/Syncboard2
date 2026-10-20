import { login } from '../lib/auth';
import { IS_MOCK } from '../lib/config';

export function Login() {
  return (
    <div className="login">
      <aside className="login__brand">
        <img className="login__logo" src="/brand/logo-primary-dark.svg" alt="SyncBOARD" height={48} />
        <img className="login__cube" src="/brand/mark-primary.svg" alt="" width={180} height={180} />
        <h1 className="login__headline">
          Seu trabalho.
          <br />
          <span>Em sintonia.</span>
        </h1>
        <p className="login__tagline">Organize tarefas, acompanhe cada etapa e mantenha sua equipe alinhada.</p>
        <p className="login__footer sb-meta">SyncBOARD · Clareza em cada etapa.</p>
      </aside>

      <main className="login__panel">
        <div className="sb-card login__card">
          <span className="login__eyebrow">Seu espaço de trabalho</span>
          <h2>Bom ter você por aqui.</h2>
          <p className="sb-meta">Acesse sua conta para continuar no SyncBOARD.</p>
          <button type="button" className="sb-button login__google" onClick={login}>
            <GoogleIcon /> Entrar com Google
          </button>
          <hr className="login__divider" />
          <p className="sb-meta">
            {IS_MOCK ? 'Modo teste: o login é simulado (sem OAuth).' : 'Acesso restrito à equipe autorizada.'}
          </p>
        </div>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41.4 36.1 44 30.6 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

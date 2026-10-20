import { IS_MOCK } from './config';
import type { ClientPrincipal } from '../types/api';
import { mockCurrentPrincipal } from './mock/fixtures';

const MOCK_KEY = 'sb-mock-logged-in';

/** Retorna o usuário autenticado (ou null). */
export async function getUserInfo(): Promise<ClientPrincipal | null> {
  if (IS_MOCK) {
    try {
      return localStorage.getItem(MOCK_KEY) === '1' ? mockCurrentPrincipal : null;
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch('/.auth/me');
    if (!res.ok) return null;
    const payload = (await res.json()) as { clientPrincipal: ClientPrincipal | null };
    return payload.clientPrincipal ?? null;
  } catch {
    return null;
  }
}

/** Inicia o login. Em mock, marca a sessão local; em live, vai para o Google. */
export function login(): void {
  if (IS_MOCK) {
    try {
      localStorage.setItem(MOCK_KEY, '1');
    } catch {
      /* ignore */
    }
    window.location.reload();
    return;
  }
  const redirect = encodeURIComponent(window.location.pathname || '/');
  window.location.href = `/.auth/login/google?post_login_redirect_uri=${redirect}`;
}

export function logout(): void {
  if (IS_MOCK) {
    try {
      localStorage.removeItem(MOCK_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
    return;
  }
  window.location.href = '/logout';
}

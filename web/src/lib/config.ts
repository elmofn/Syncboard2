/*
 * Modo de execução.
 *  - mock (padrão): login e quadro funcionam SEM OAuth/APIs, com dados em memória.
 *  - live: usa /.auth/me (Google OAuth) e /api/* reais (ver docs/API.md).
 * Alterne com VITE_MODE=live (ex.: `VITE_MODE=live npm run dev` + SWA CLI na 4280).
 */
export const MODE: 'mock' | 'live' = import.meta.env.VITE_MODE === 'live' ? 'live' : 'mock';
export const IS_MOCK = MODE === 'mock';
export const IS_LIVE = MODE === 'live';

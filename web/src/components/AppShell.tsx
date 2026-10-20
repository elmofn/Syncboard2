import type { ReactNode } from 'react';
import type { ClientPrincipal } from '../types/api';
import { logout } from '../lib/auth';
import { IS_MOCK } from '../lib/config';
import { Avatar } from './Avatar';

function userName(user: ClientPrincipal): string {
  const claim = user.claims?.find((c) => c.typ === 'name');
  return claim?.val || user.userDetails;
}

export function AppShell({ user, children }: { user: ClientPrincipal; children: ReactNode }) {
  const name = userName(user);
  return (
    <div className="shell">
      <header className="shell__header">
        <div className="shell__brand">
          <img src="/brand/mark-primary.svg" alt="" width={28} height={28} />
          <strong>SyncBOARD</strong>
          {IS_MOCK && <span className="shell__mode">Modo teste</span>}
        </div>
        <div className="shell__user">
          <Avatar person={{ email: user.userDetails, name }} small />
          <span className="sb-meta">{name}</span>
          <button type="button" className="sb-button sb-button--ghost" onClick={logout}>
            Sair
          </button>
        </div>
      </header>
      <main className="shell__main">{children}</main>
    </div>
  );
}

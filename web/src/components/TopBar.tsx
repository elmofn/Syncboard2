import type { ClientPrincipal, Notification } from '../types/api';
import { Avatar } from './Avatar';

interface Props {
  user: ClientPrincipal;
  crumb: string;
  notifications: Notification[];
}

export function TopBar({ user, crumb, notifications }: Props) {
  const name = user.claims?.find((c) => c.typ === 'name')?.val || user.userDetails;
  const unread = notifications.filter((n) => !n.isRead).length;
  return (
    <div className="topbar">
      <nav className="topbar__crumb sb-meta" aria-label="Trilha">
        <span>Espaço de trabalho</span>
        <span aria-hidden="true">/</span>
        <span className="topbar__crumb-current">{crumb}</span>
      </nav>
      <div className="topbar__actions">
        <button type="button" className="topbar__bell" aria-label="Notificações">
          🔔
          {unread > 0 && <span className="topbar__badge">{unread}</span>}
        </button>
        <Avatar person={{ email: user.userDetails, name }} small />
      </div>
    </div>
  );
}

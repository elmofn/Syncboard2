import { useEffect, useRef, useState } from 'react';
import type { ClientPrincipal, Notification } from '../types/api';
import { Avatar } from './Avatar';
import { NotificationsPanel } from './NotificationsPanel';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  user: ClientPrincipal;
  crumb: string;
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onOpenTask: (taskId: string) => void;
}

export function TopBar({ user, crumb, notifications, onMarkRead, onOpenTask }: Props) {
  const name = user.claims?.find((c) => c.typ === 'name')?.val || user.userDetails;
  const unread = notifications.filter((n) => !n.isRead).length;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="topbar">
      <nav className="topbar__crumb sb-meta" aria-label="Trilha">
        <span>Espaço de trabalho</span>
        <span aria-hidden="true">/</span>
        <span className="topbar__crumb-current">{crumb}</span>
      </nav>
      <div className="topbar__actions">
        <ThemeToggle className="topbar__bell" />
        <div className="topbar__notif" ref={ref}>
          <button type="button" className="topbar__bell" aria-label="Notificações" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            🔔
            {unread > 0 && <span className="topbar__badge">{unread}</span>}
          </button>
          {open && (
            <NotificationsPanel
              notifications={notifications}
              onMarkRead={onMarkRead}
              onOpenTask={onOpenTask}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
        <Avatar person={{ email: user.userDetails, name }} small />
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Bell, List, SignOut } from '@phosphor-icons/react';
import type { ClientPrincipal, Notification } from '../types/api';
import { logout } from '../lib/auth';
import { Avatar } from './Avatar';
import { NotificationsPanel } from './NotificationsPanel';
import { ThemeToggle } from './ThemeToggle';
import { SoundToggle } from './SoundToggle';

interface Props {
  user: ClientPrincipal;
  crumb: string;
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onOpenTask: (taskId: string) => void;
  onToggleSidebar: () => void;
}

export function TopBar({ user, crumb, notifications, onMarkRead, onOpenTask, onToggleSidebar }: Props) {
  const name = user.claims?.find((c) => c.typ === 'name')?.val || user.userDetails;
  const picture = user.claims?.find((c) => c.typ === 'picture')?.val;
  const unread = notifications.filter((n) => !n.isRead).length;
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!userOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!userRef.current?.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [userOpen]);

  return (
    <div className="topbar">
      <button type="button" className="topbar__burger" aria-label="Menu" onClick={onToggleSidebar}><List /></button>
      <nav className="topbar__crumb sb-meta" aria-label="Trilha">
        <span>Espaço de trabalho</span>
        <span aria-hidden="true">/</span>
        <span className="topbar__crumb-current">{crumb}</span>
      </nav>
      <div className="topbar__actions">
        <SoundToggle className="topbar__bell" />
        <ThemeToggle className="topbar__bell" />
        <div className="topbar__notif" ref={ref}>
          <button type="button" className="topbar__bell" aria-label="Notificações" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <Bell />
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
        <div className="topbar__user" ref={userRef}>
          <button
            type="button"
            className="topbar__user-btn"
            aria-label="Conta"
            aria-expanded={userOpen}
            onClick={() => setUserOpen((v) => !v)}
          >
            <Avatar person={{ email: user.userDetails, name, picture }} small />
          </button>
          {userOpen && (
            <div className="topbar__menu" role="menu">
              <div className="topbar__menu-head">
                <Avatar person={{ email: user.userDetails, name, picture }} small />
                <div className="topbar__menu-id">
                  <strong>{name}</strong>
                  <small className="sb-meta">{user.userDetails}</small>
                </div>
              </div>
              <button type="button" className="topbar__menu-item" role="menuitem" onClick={logout}>
                <SignOut /> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

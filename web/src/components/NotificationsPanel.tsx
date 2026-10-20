import type { Notification } from '../types/api';

interface Props {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onOpenTask: (taskId: string) => void;
  onClose: () => void;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function NotificationsPanel({ notifications, onMarkRead, onOpenTask, onClose }: Props) {
  const sorted = [...notifications].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const unread = notifications.filter((n) => !n.isRead);

  return (
    <div className="notif" role="menu">
      <header className="notif__head">
        <strong>Notificações</strong>
        {unread.length > 0 && (
          <button type="button" className="notif__clear" onClick={() => unread.forEach((n) => onMarkRead(n.id))}>
            Marcar todas como lidas
          </button>
        )}
      </header>
      {sorted.length === 0 ? (
        <p className="empty-box sb-meta">Nenhuma notificação.</p>
      ) : (
        <ul className="notif__list">
          {sorted.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`notif__item${n.isRead ? '' : ' is-unread'}`}
                onClick={() => {
                  if (!n.isRead) onMarkRead(n.id);
                  if (n.taskId) onOpenTask(n.taskId);
                  onClose();
                }}
              >
                {!n.isRead && <span className="notif__dot" aria-label="não lida" />}
                <span className="notif__body">
                  <strong>{n.message}</strong>
                  {n.commentPreview && <span className="notif__preview sb-meta">{n.commentPreview}</span>}
                  <span className="sb-meta">{n.taskId ? `${n.taskId} · ` : ''}{fmt(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import type { Task } from '../types/api';
import { Avatar } from './Avatar';
import { StatusBadge } from './StatusBadge';

export function TaskCard({ task, onDragStart }: { task: Task; onDragStart: (id: string) => void }) {
  const responsibles = Array.isArray(task.responsible) ? task.responsible : [];
  const hasAlert = Array.isArray(task.pendingAlerts) && task.pendingAlerts.length > 0;
  return (
    <article
      className="sb-card task-card"
      draggable
      onDragStart={() => onDragStart(task.id)}
      style={{ borderLeft: `4px solid ${task.projectColor || 'var(--sb-border-strong)'}` }}
    >
      <div className="task-card__top">
        <span className="sb-meta">{task.id}</span>
        {hasAlert && <span className="task-card__alert" title="Atenção solicitada">!</span>}
      </div>
      <h3 className="task-card__title">{task.title}</h3>
      <div className="task-card__meta">
        <StatusBadge status={task.status} />
        {task.project && <span className="sb-meta">{task.project}</span>}
      </div>
      <div className="task-card__footer">
        <div className="task-card__people">
          {responsibles.slice(0, 4).map((p, i) => (
            <Avatar key={i} person={p} small />
          ))}
        </div>
        {task.priority && <span className="sb-meta">{task.priority}</span>}
      </div>
    </article>
  );
}

import type { Task } from '../types/api';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { TaskFlowMini } from './TaskFlowMini';

export function TaskCard({
  task,
  onDragStart,
  onOpen,
}: {
  task: Task;
  onDragStart: (id: string) => void;
  onOpen?: (task: Task) => void;
}) {
  const hasAlert = Array.isArray(task.pendingAlerts) && task.pendingAlerts.length > 0;
  const comments = Array.isArray(task.comments) ? task.comments.length : 0;
  return (
    <article
      className="sb-card task-card"
      draggable
      onDragStart={() => onDragStart(task.id)}
      onClick={() => onOpen?.(task)}
      style={{ borderLeft: `4px solid ${task.projectColor || 'var(--sb-border-strong)'}` }}
    >
      <div className="task-card__top">
        <span className="sb-meta">{task.id}</span>
        <span className="sb-row">
          {hasAlert && <span className="task-card__alert" title="Atenção solicitada">!</span>}
          <span className="sb-meta">⚑ {task.priority}</span>
        </span>
      </div>
      <h3 className="task-card__title">{task.title}</h3>
      <div className="task-card__meta">
        <StatusBadge status={task.status} />
        {task.project && <span className="sb-meta">{task.project}</span>}
      </div>
      {typeof task.progress === 'number' && <ProgressBar value={task.progress} label />}
      <div className="task-card__footer">
        <TaskFlowMini task={task} />
        <span className="sb-meta">💬 {comments}</span>
      </div>
    </article>
  );
}

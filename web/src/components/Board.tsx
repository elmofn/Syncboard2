import { useRef, type CSSProperties, type DragEvent } from 'react';
import type { Task, TaskStatus } from '../types/api';
import { BOARD_COLUMNS, STATUS_META } from '../lib/status';
import { TaskCard } from './TaskCard';

interface Props {
  tasks: Task[];
  moveTask: (id: string, status: TaskStatus) => void;
  reorderTask: (id: string, status: TaskStatus, order: number, prevStatus?: TaskStatus, etag?: string) => void;
  onOpen?: (task: Task) => void;
  notify?: (msg: string) => void;
}

const COLUMN_BORDER: Record<TaskStatus, string> = {
  todo: 'var(--sb-border-strong)',
  stopped: 'var(--sb-status-stopped-fg)',
  inprogress: 'var(--sb-status-inprogress-fg)',
  homologation: 'var(--sb-status-homologation-fg)',
  publication: 'var(--sb-status-publication-fg)',
  done: 'var(--sb-border-strong)',
};

export function Board({ tasks, moveTask, reorderTask, onOpen, notify }: Props) {
  const draggedId = useRef<string | null>(null);

  const onDrop = (status: TaskStatus) => {
    const id = draggedId.current;
    draggedId.current = null;
    if (id) moveTask(id, status);
  };

  const onCardDrop = (e: DragEvent, target: Task) => {
    e.stopPropagation();
    const id = draggedId.current;
    draggedId.current = null;
    if (!id || id === target.id) return;
    const dragged = tasks.find((t) => t.id === id);
    if (!dragged) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const placeAfter = e.clientY - rect.top > rect.height / 2;
    const column = tasks.filter((t) => t.status === target.status && t.id !== id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = column.findIndex((t) => t.id === target.id);
    const before = placeAfter ? column[idx] : column[idx - 1];
    const after = placeAfter ? column[idx + 1] : column[idx];
    const beforeO = before ? before.order : (after ? after.order - 2 : 0);
    const afterO = after ? after.order : (before ? before.order + 2 : 0);
    const newOrder = (beforeO + afterO) / 2;
    const statusChanged = dragged.status !== target.status;
    reorderTask(id, target.status, newOrder, statusChanged ? dragged.status : undefined, dragged._etag);
  };

  return (
    <div className="board">
      {BOARD_COLUMNS.map((status) => {
        const column = tasks
          .filter((t) => t.status === status)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return (
          <section
            key={status}
            className="board-column"
            style={{ ['--col' as string]: COLUMN_BORDER[status] } as CSSProperties}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(status)}
          >
            <header className="board-column__head">
              <span aria-hidden="true">{STATUS_META[status].icon}</span>
              <h2>{STATUS_META[status].label}</h2>
              <span className="board-column__count sb-meta">{column.length}</span>
            </header>
            <div className="board-column__list">
              {column.map((task) => (
                <div
                  key={task.id}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => onCardDrop(e, task)}
                >
                  <TaskCard
                    task={task}
                    onDragStart={(id) => (draggedId.current = id)}
                    onOpen={onOpen}
                    notify={notify}
                  />
                </div>
              ))}
              {column.length === 0 && <p className="board-column__empty sb-meta">Nenhuma tarefa nesta etapa.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

import { useRef, type CSSProperties } from 'react';
import type { Task, TaskStatus } from '../types/api';
import { BOARD_COLUMNS, STATUS_META } from '../lib/status';
import { TaskCard } from './TaskCard';

interface Props {
  tasks: Task[];
  moveTask: (id: string, status: TaskStatus) => void;
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

export function Board({ tasks, moveTask, onOpen, notify }: Props) {
  const draggedId = useRef<string | null>(null);

  const onDrop = (status: TaskStatus) => {
    const id = draggedId.current;
    draggedId.current = null;
    if (id) moveTask(id, status);
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
                <TaskCard
                  key={task.id}
                  task={task}
                  onDragStart={(id) => (draggedId.current = id)}
                  onOpen={onOpen}
                  notify={notify}
                />
              ))}
              {column.length === 0 && <p className="board-column__empty sb-meta">Nenhuma tarefa nesta etapa.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

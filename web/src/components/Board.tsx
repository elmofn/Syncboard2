import { useRef } from 'react';
import type { TaskStatus } from '../types/api';
import { BOARD_COLUMNS, STATUS_META } from '../lib/status';
import { useTasks } from '../hooks/useTasks';
import { TaskCard } from './TaskCard';

export function Board() {
  const { tasks, error, moveTask } = useTasks();
  const draggedId = useRef<string | null>(null);

  const onDrop = (status: TaskStatus) => {
    const id = draggedId.current;
    draggedId.current = null;
    if (id) moveTask(id, status);
  };

  if (error) {
    return (
      <div className="sb-panel board-error" role="alert">
        <strong>Não foi possível carregar.</strong>
        <p className="sb-meta">{error}</p>
      </div>
    );
  }

  if (!tasks) {
    return <div className="board-loading sb-meta">Carregando tarefas…</div>;
  }

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
                <TaskCard key={task.id} task={task} onDragStart={(id) => (draggedId.current = id)} />
              ))}
              {column.length === 0 && <p className="board-column__empty sb-meta">Sem tarefas</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

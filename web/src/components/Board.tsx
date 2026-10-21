import { Fragment, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import type { Task, TaskStatus } from '../types/api';
import { BOARD_COLUMNS, STATUS_META } from '../lib/status';
import { useFlip } from '../lib/useFlip';
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragH, setDragH] = useState(96);
  const [over, setOver] = useState<{ status: TaskStatus; index: number } | null>(null);

  const columnCards = (status: TaskStatus) =>
    tasks.filter((t) => t.status === status).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const reset = () => {
    draggedId.current = null;
    setDragId(null);
    setOver(null);
  };

  const onDragStart = (id: string, e: DragEvent<HTMLElement>) => {
    draggedId.current = id;
    setDragH(e.currentTarget.offsetHeight || 96);
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    } catch {
      /* ignore */
    }
    // Reset reliably even if the drop happens outside any column (listener on
    // the node itself fires regardless of React unmounting it).
    const node = e.currentTarget;
    const onEnd = () => {
      reset();
      node.removeEventListener('dragend', onEnd);
    };
    node.addEventListener('dragend', onEnd);
    // Defer so the browser captures the native drag image before we lift the card out.
    requestAnimationFrame(() => setDragId(id));
  };

  const setSlot = (status: TaskStatus, index: number) =>
    setOver((prev) => (prev && prev.status === status && prev.index === index ? prev : { status, index }));

  const onCardDragOver = (e: DragEvent, status: TaskStatus, posInList: number) => {
    e.preventDefault();
    e.stopPropagation();
    try { e.dataTransfer.dropEffect = 'move'; } catch { /* ignore */ }
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    setSlot(status, after ? posInList + 1 : posInList);
  };

  const onColumnDragOver = (e: DragEvent, status: TaskStatus, count: number) => {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch { /* ignore */ }
    if (!over || over.status !== status) setSlot(status, count);
  };

  const onColumnDragLeave = (e: DragEvent, status: TaskStatus) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setOver((prev) => (prev?.status === status ? null : prev));
    }
  };

  const onDrop = (e: DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    const id = draggedId.current;
    const target = over;
    reset();
    if (!id || !target || target.status !== status) return;
    const dragged = tasks.find((t) => t.id === id);
    if (!dragged) return;
    const list = columnCards(status).filter((t) => t.id !== id);
    if (list.length === 0) {
      if (dragged.status !== status) moveTask(id, status);
      return;
    }
    const idx = Math.max(0, Math.min(target.index, list.length));
    const before = list[idx - 1];
    const after = list[idx];
    const beforeO = before ? before.order : after ? after.order - 2 : 0;
    const afterO = after ? after.order : before ? before.order + 2 : 0;
    const newOrder = (beforeO + afterO) / 2;
    const statusChanged = dragged.status !== status;
    reorderTask(id, status, newOrder, statusChanged ? dragged.status : undefined, dragged._etag);
  };

  const Placeholder = () => (
    <div className="card-placeholder" style={{ height: dragH }} aria-hidden="true" />
  );

  const boardRef = useFlip<HTMLDivElement>();

  return (
    <div ref={boardRef} className={`board${dragId ? ' is-dragging' : ''}`}>
      {BOARD_COLUMNS.map((status) => {
        const all = columnCards(status);
        const visible = dragId ? all.filter((t) => t.id !== dragId) : all;
        const StatusIcon = STATUS_META[status].icon;
        const showPh = over?.status === status;
        const phIndex = showPh ? Math.max(0, Math.min(over.index, visible.length)) : -1;
        return (
          <section
            key={status}
            className={`board-column${showPh ? ' is-drop' : ''}`}
            style={{ ['--col' as string]: COLUMN_BORDER[status] } as CSSProperties}
            onDragOver={(e) => onColumnDragOver(e, status, visible.length)}
            onDragLeave={(e) => onColumnDragLeave(e, status)}
            onDrop={(e) => onDrop(e, status)}
          >
            <header className="board-column__head">
              <StatusIcon weight="light" aria-hidden="true" />
              <h2>{STATUS_META[status].label}</h2>
              <span className="board-column__count sb-meta">{all.length}</span>
            </header>
            <div className="board-column__list">
              {visible.map((task, i) => (
                <Fragment key={task.id}>
                  {phIndex === i && <Placeholder />}
                  <div data-flip={task.id} onDragOver={(e) => onCardDragOver(e, status, i)} onDrop={(e) => onDrop(e, status)}>
                    <TaskCard task={task} onDragStart={onDragStart} onDragEnd={reset} onOpen={onOpen} notify={notify} />
                  </div>
                </Fragment>
              ))}
              {phIndex === visible.length && <Placeholder />}
              {visible.length === 0 && phIndex !== 0 && (
                <p className="board-column__empty sb-meta">Nenhuma tarefa nesta etapa.</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

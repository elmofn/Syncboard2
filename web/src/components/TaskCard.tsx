import { useEffect, useRef, useState } from 'react';
import type { Task } from '../types/api';
import { api } from '../lib/api';
import { play } from '../lib/sound';
import { ArrowRight, ArrowCounterClockwise, ArrowsOutSimple, ChatCircle, DotsThree, Flag, Trash } from '@phosphor-icons/react';
import { useConfirm } from './ConfirmDialog';
import { ProgressBar } from './ProgressBar';
import { TaskFlowMini } from './TaskFlowMini';

interface Props {
  task: Task;
  onDragStart: (id: string) => void;
  onOpen?: (task: Task) => void;
  notify?: (msg: string) => void;
}

export function TaskCard({ task, onDragStart, onOpen, notify }: Props) {
  const hasAlert = Array.isArray(task.pendingAlerts) && task.pendingAlerts.length > 0;
  const comments = Array.isArray(task.comments) ? task.comments.length : 0;
  const isHomolog = task.status === 'homologation';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const act = async (fn: () => Promise<unknown>, err: string) => {
    setMenuOpen(false);
    try {
      await fn();
    } catch (e) {
      play('error');
      notify?.(e instanceof Error ? e.message : err);
    }
  };

  const decide = (action: 'approve' | 'reject') =>
    act(async () => {
      await api.updateTask(task.id, { homologationAction: action, expectedStatus: 'homologation', expectedEtag: task._etag });
      play(action === 'approve' ? 'success' : 'move');
    }, 'Falha na decisão de homologação.');

  const del = async () => {
    setMenuOpen(false);
    const ok = await confirm({
      title: 'Excluir tarefa?',
      message: `A tarefa ${task.id} será removida permanentemente do quadro. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Sim, remover',
      danger: true,
    });
    if (!ok) return;
    void act(() => api.deleteTask(task.id), 'Falha ao excluir a tarefa.');
  };

  return (
    <article
      className="sb-card task-card"
      draggable
      onDragStart={() => onDragStart(task.id)}
      onClick={() => onOpen?.(task)}
    >
      <div className="task-card__top">
        <span className="task-card__id sb-meta">
          {hasAlert && <span className="task-card__alert" title="Atenção solicitada">!</span>}
          {task.id}
        </span>
        <div className="task-card__top-right">
          <span className="sb-meta"><Flag /> {task.priority}</span>
          <span className="sb-meta">{task.dueDate ? new Date(task.dueDate).toLocaleDateString('pt-BR') : 'Sem prazo'}</span>
          <div className="card-menu" ref={menuRef}>
            <button
              type="button"
              className="card-menu__btn"
              aria-label="Ações da tarefa"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              <DotsThree weight="bold" />
            </button>
            {menuOpen && (
              <div className="card-menu__list" role="menu" onClick={(e) => e.stopPropagation()}>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpen?.(task); }}>
                  <ArrowsOutSimple /> Detalhes
                </button>
                {isHomolog && (
                  <>
                    <button type="button" role="menuitem" onClick={() => decide('approve')}><ArrowRight /> Aprovar</button>
                    <button type="button" role="menuitem" className="is-danger" onClick={() => decide('reject')}><ArrowCounterClockwise /> Reprovar</button>
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpen?.(task); }}><ArrowRight /> Encaminhar</button>
                  </>
                )}
                <button type="button" role="menuitem" className="is-danger" onClick={del}><Trash /> Excluir tarefa</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <h3 className="task-card__title">{task.title}</h3>

      {task.project && (
        <span className="task-card__project">
          <span className="task-card__project-dot" />
          {task.project}
        </span>
      )}

      <ProgressBar value={task.progress ?? 0} label labelText="Progresso informado" />

      <div className="task-card__footer">
        <TaskFlowMini task={task} />
        <span className="sb-meta task-card__comments"><ChatCircle /> {comments}</span>
      </div>
    </article>
  );
}

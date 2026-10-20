import type { Task } from '../types/api';
import { personName } from '../types/api';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';

function responsibleNames(task: Task): string {
  const people = Array.isArray(task.responsible) ? task.responsible : [];
  return people.map(personName).join(', ') || '—';
}

export function ListView({ tasks, onOpen }: { tasks: Task[]; onOpen?: (task: Task) => void }) {
  if (tasks.length === 0) {
    return <p className="list-empty sb-meta">Nenhuma tarefa encontrada com os filtros atuais.</p>;
  }
  return (
    <div className="list">
      <div className="list__head sb-meta">
        <span>Tarefa</span>
        <span>Estado</span>
        <span>Solicitante</span>
        <span>Responsáveis</span>
        <span>Homologador</span>
        <span>Prioridade</span>
        <span>Prazo</span>
        <span>Progresso</span>
      </div>
      {tasks.map((task) => {
        const attachments = Array.isArray(task.attachments) ? task.attachments.length : 0;
        return (
          <button type="button" key={task.id} className="list__row" onClick={() => onOpen?.(task)}>
            <span className="list__task">
              <span className="sb-meta">
                {task.id} · <span className="list__dot" style={{ background: task.projectColor }} /> {task.project || '—'}
              </span>
              <strong>{task.title}</strong>
              <span className="sb-meta">
                {task.createdAt ? `Criação: ${new Date(task.createdAt).toLocaleDateString('pt-BR')}` : ''}
                {attachments > 0 ? ` · ${attachments} anexo${attachments > 1 ? 's' : ''}` : ''}
              </span>
            </span>
            <span>
              <StatusBadge status={task.status} />
            </span>
            <span className="sb-meta">{task.createdBy || 'Não registrado'}</span>
            <span className="sb-meta">{responsibleNames(task)}</span>
            <span className="sb-meta">{personName(task.homologador) || 'Não informado'}</span>
            <span className="sb-meta">⚑ {task.priority || '—'}</span>
            <span className="sb-meta">{task.dueDate ? new Date(task.dueDate).toLocaleDateString('pt-BR') : 'Sem prazo'}</span>
            <span className="list__progress">
              <ProgressBar value={task.progress ?? 0} />
              <span className="sb-meta">{Math.round(task.progress ?? 0)}%</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

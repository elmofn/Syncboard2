import { useState } from 'react';
import type { Task, User, ClientPrincipal, PersonRef } from '../types/api';
import { personEmail, personName } from '../types/api';
import { api } from '../lib/api';
import { Avatar } from './Avatar';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { CommentEditor } from './CommentEditor';

type Tab = 'comentarios' | 'anexos' | 'historico';

interface Props {
  task: Task;
  users: User[];
  currentUser: ClientPrincipal;
  onClose: () => void;
  notify: (msg: string) => void;
}

function Html({ html, className }: { html: string; className?: string }) {
  // Conteúdo vindo do backend/mock. Sanitização entra na fase de endurecimento.
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function fmt(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

const HISTORY_ICON: Record<string, string> = {
  created: '＋',
  attention_requested: '📣',
  edited: '✎',
};

export function TaskDetail({ task, users, currentUser, onClose, notify }: Props) {
  const [tab, setTab] = useState<Tab>('comentarios');
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTo, setForwardTo] = useState('');
  const [forwardNote, setForwardNote] = useState('');
  const [busy, setBusy] = useState(false);

  const responsibles = Array.isArray(task.responsible) ? task.responsible : [];
  const comments = Array.isArray(task.comments) ? task.comments : [];
  const attachments = Array.isArray(task.attachments) ? task.attachments : [];
  const history = Array.isArray(task.history) ? [...task.history].reverse() : [];
  const isHomolog = task.status === 'homologation';

  const run = async (fn: () => Promise<unknown>, errMsg: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : errMsg);
    } finally {
      setBusy(false);
    }
  };

  const decide = (action: 'approve' | 'reject') =>
    run(
      () => api.updateTask(task.id, { homologationAction: action, expectedStatus: 'homologation', expectedEtag: task._etag }),
      'Falha na decisão de homologação.',
    );

  const forward = () => {
    if (!forwardTo || !forwardNote.trim()) {
      notify('Selecione o responsável e informe a orientação de continuidade.');
      return;
    }
    void run(async () => {
      await api.updateTask(task.id, {
        homologationAction: 'forward',
        newResponsibleEmail: forwardTo,
        forwardInstructions: forwardNote.trim(),
        expectedStatus: 'homologation',
        expectedEtag: task._etag,
      });
      setForwardOpen(false);
      setForwardNote('');
      setForwardTo('');
    }, 'Falha ao encaminhar.');
  };

  const chamarAtencao = () => {
    const targets = responsibles.map(personName).filter(Boolean);
    if (targets.length === 0) {
      notify('Não há responsáveis para sinalizar.');
      return;
    }
    void run(() => api.signalResponsible(task.id, targets), 'Falha ao chamar atenção.');
  };

  const flow = buildFlow(task);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Tarefa ${task.id}`} onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <div className="sb-row">
            <span className="modal__chip">#{task.id}</span>
            <StatusBadge status={task.status} />
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar">✕</button>
        </header>

        <div className="modal__body">
          {/* Coluna esquerda */}
          <div className="modal__left">
            <h1>{task.title}</h1>

            <section className="detail-block detail-block--desc">
              <h2>Descrição da Tarefa</h2>
              <p className="sb-meta">Informações básicas e escopo da tarefa</p>
              <p className="detail-block__text">{task.description}</p>
            </section>

            <section className="detail-block detail-block--progress">
              <h2>
                Atualização de Progresso <span className="detail-block__pct">{Math.round(task.progress ?? 0)}%</span>
              </h2>
              <p className="sb-meta">Pendências informadas na atualização do progresso</p>
              <p className="detail-block__text">Pendência não informada.</p>
            </section>

            {task.continuityInstructions && (
              <section className="detail-block detail-block--continuity">
                <h2>Orientação de Continuidade</h2>
                <p className="sb-meta">Orientações do homologador no último encaminhamento</p>
                <p className="detail-block__text">{task.continuityInstructions}</p>
              </section>
            )}

            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'comentarios'} className={tab === 'comentarios' ? 'is-active' : ''} onClick={() => setTab('comentarios')}>
                Comentários ({comments.length})
              </button>
              <button type="button" role="tab" aria-selected={tab === 'anexos'} className={tab === 'anexos' ? 'is-active' : ''} onClick={() => setTab('anexos')}>
                Anexos ({attachments.length})
              </button>
              <button type="button" role="tab" aria-selected={tab === 'historico'} className={tab === 'historico' ? 'is-active' : ''} onClick={() => setTab('historico')}>
                Histórico
              </button>
            </div>

            {tab === 'comentarios' && (
              <div className="tab-panel">
                {comments.length === 0 ? (
                  <p className="empty-box sb-meta">Nenhum comentário ainda. Use o campo abaixo para começar.</p>
                ) : (
                  <ul className="comments">
                    {comments.map((c) => (
                      <li key={c.id} className="comment">
                        <Avatar person={typeof c.author === 'object' ? c.author : { email: '', name: String(c.author) }} small />
                        <div>
                          <div className="comment__meta sb-meta">
                            <strong>{personName(c.author as PersonRef)}</strong> · {fmt(c.timestamp)}
                            {c.editedAt && ' (editado)'}
                          </div>
                          <Html className="comment__text" html={c.text} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <CommentEditor onSubmit={(html) => run(() => api.addComment(task.id, { text: html }), 'Falha ao comentar.')} />
                <p className="sb-meta">Enter envia; Shift + Enter cria uma linha. Use @ para mencionar.</p>
              </div>
            )}

            {tab === 'anexos' && (
              <div className="tab-panel">
                {attachments.length === 0 ? (
                  <p className="empty-box sb-meta">Nenhum anexo.</p>
                ) : (
                  <ul className="attachments">
                    {attachments.map((a, i) => (
                      <li key={i} className="attachment">
                        <span aria-hidden="true">📄</span>
                        <div>
                          <strong>{a.name}</strong>
                          <small className="sb-meta">Vinculado à tarefa</small>
                        </div>
                        <a className="attachment__view" href={a.url} target="_blank" rel="noreferrer" aria-label="Abrir anexo">👁</a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'historico' && (
              <div className="tab-panel">
                {history.length === 0 ? (
                  <p className="empty-box sb-meta">Sem histórico.</p>
                ) : (
                  <ul className="timeline">
                    {history.map((h, i) => (
                      <li key={i} className="timeline__item">
                        <span className="timeline__icon" aria-hidden="true">{HISTORY_ICON[h.action] || '•'}</span>
                        <div>
                          <Html className="timeline__desc" html={h.description} />
                          <div className="sb-meta">{fmt(h.timestamp)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Coluna direita */}
          <aside className="modal__right">
            <h2>Resumo</h2>
            <div className="summary__field">
              <span className="sb-meta">Projeto</span>
              <span className="summary__project">{task.project || '—'}</span>
            </div>
            <div className="summary__grid">
              <div>
                <span className="sb-meta">Prioridade</span>
                <div>⚑ {task.priority}</div>
              </div>
              <div>
                <span className="sb-meta">Prazo</span>
                <div>{task.dueDate ? new Date(task.dueDate).toLocaleDateString('pt-BR') : 'Sem prazo informado'}</div>
              </div>
            </div>

            <h2 className="summary__flow-title">Fluxo</h2>
            <ul className="flow">
              {flow.map((f, i) => (
                <li key={i} className="flow__item">
                  <Avatar person={f.person} small />
                  <div>
                    <strong>{f.name}</strong>
                    <div className="sb-meta">
                      {f.role}
                      {f.at ? ` · ${fmt(f.at)}` : ''}
                    </div>
                    {f.alert && <div className="flow__alert">• Atenção solicitada {fmt(f.alert)}</div>}
                  </div>
                </li>
              ))}
            </ul>

            <ProgressBar value={task.progress ?? 0} label />

            <div className="summary__actions">
              {isHomolog ? (
                <>
                  <button type="button" className="sb-button" disabled={busy} onClick={() => decide('approve')}>✓ Aprovar</button>
                  <button type="button" className="sb-button sb-button--secondary" disabled={busy} onClick={() => setForwardOpen((v) => !v)}>→ Encaminhar</button>
                  <button type="button" className="sb-button sb-button--secondary action-danger" disabled={busy} onClick={() => decide('reject')}>↺ Reprovar</button>
                  {forwardOpen && (
                    <div className="forward-form">
                      <select className="sb-select" value={forwardTo} onChange={(e) => setForwardTo(e.target.value)}>
                        <option value="">Novo responsável…</option>
                        {users.filter((u) => u.email).map((u) => (
                          <option key={u.email} value={u.email}>{u.name}</option>
                        ))}
                      </select>
                      <textarea className="sb-textarea" placeholder="Orientação de continuidade" value={forwardNote} onChange={(e) => setForwardNote(e.target.value)} />
                      <button type="button" className="sb-button" disabled={busy} onClick={forward}>Confirmar encaminhamento</button>
                    </div>
                  )}
                </>
              ) : (
                <button type="button" className="sb-button sb-button--secondary" disabled={busy} onClick={chamarAtencao}>📣 Chamar atenção</button>
              )}
              <button type="button" className="sb-button sb-button--secondary" onClick={() => notify('Marcar reunião: integração de calendário chega num próximo passo.')}>📅 Marcar reunião</button>
            </div>
          </aside>
        </div>

        <footer className="modal__foot">
          <span className="sb-meta">Alterações e comentários usam as ações desta tarefa.</span>
          <div className="sb-row">
            <button type="button" className="sb-button sb-button--secondary" onClick={onClose}>✕ Fechar</button>
            <button type="button" className="sb-button" onClick={() => notify('Editar tarefa (formulário) chega no próximo passo.')}>✎ Editar tarefa</button>
          </div>
        </footer>
      </div>
    </div>
  );

  void currentUser; // reservado para restringir ações ao homologador designado (fase live)
}

interface FlowEntry {
  name: string;
  role: string;
  person: PersonRef;
  at?: string;
  alert?: string;
}

function buildFlow(task: Task): FlowEntry[] {
  const out: FlowEntry[] = [];
  const requesterName = task.requester?.name || task.createdBy;
  if (requesterName) {
    out.push({ name: requesterName, role: 'Solicitante', at: task.createdAt, person: task.requester ?? { email: '', name: requesterName } });
  }
  const resp = Array.isArray(task.responsible) ? task.responsible : [];
  const alerts = Array.isArray(task.pendingAlerts) ? task.pendingAlerts : [];
  resp.forEach((r, i) => {
    const name = personName(r);
    const alert = alerts.find((a) => a.targetUser === name || a.targetUser === personEmail(r));
    out.push({ name, role: i === 0 ? 'Responsável principal' : 'Responsável', person: r, alert: alert?.timestamp });
  });
  out.push({
    name: personName(task.homologador) || 'Não informado',
    role: 'Homologador',
    person: task.homologador ?? { email: '', name: 'Não informado' },
  });
  return out;
}

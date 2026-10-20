import { useRef, useState } from 'react';
import type { Task, User, ClientPrincipal, PersonRef, Attachment } from '../types/api';
import { personName } from '../types/api';
import { api } from '../lib/api';
import { useEscape } from '../lib/useEscape';
import { play } from '../lib/sound';
import { buildTaskFlow } from '../lib/flow';
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
  onEdit: () => void;
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

export function TaskDetail({ task, users, currentUser, onClose, onEdit, notify }: Props) {
  const [tab, setTab] = useState<Tab>('comentarios');
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTo, setForwardTo] = useState('');
  const [forwardNote, setForwardNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const [attnOpen, setAttnOpen] = useState(false);
  const [attnTargets, setAttnTargets] = useState<string[]>([]);
  const attachRef = useRef<HTMLInputElement>(null);
  useEscape(onClose);

  const responsibles = Array.isArray(task.responsible) ? task.responsible : [];
  const comments = Array.isArray(task.comments) ? task.comments : [];
  const attachments = Array.isArray(task.attachments) ? task.attachments : [];
  const history = Array.isArray(task.history) ? [...task.history].reverse() : [];
  const isHomolog = task.status === 'homologation';

  const myEmail = currentUser.userDetails.toLowerCase();
  const myName = currentUser.claims?.find((c) => c.typ === 'name')?.val || currentUser.userDetails;
  const myAlert = (Array.isArray(task.pendingAlerts) ? task.pendingAlerts : []).find(
    (a) => (a.targetUser === myName || a.targetUser.toLowerCase() === myEmail) && !a.acknowledgedAt,
  );
  const canEditComment = (author: PersonRef) => {
    const email = (typeof author === 'object' ? author.email : '').toLowerCase();
    const name = typeof author === 'object' ? author.name : author;
    return email === myEmail || name === myName;
  };

  const run = async (fn: () => Promise<unknown>, errMsg: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      play('error');
      notify(e instanceof Error ? e.message : errMsg);
    } finally {
      setBusy(false);
    }
  };

  const decide = (action: 'approve' | 'reject') =>
    run(async () => {
      await api.updateTask(task.id, { homologationAction: action, expectedStatus: 'homologation', expectedEtag: task._etag });
      play(action === 'approve' ? 'success' : 'move');
    }, 'Falha na decisão de homologação.');

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

  const toggleAttn = () => {
    const names = responsibles.map(personName).filter(Boolean);
    if (names.length === 0) {
      notify('Não há responsáveis para sinalizar.');
      return;
    }
    setAttnTargets(names);
    setAttnOpen((v) => !v);
  };
  const confirmAttn = () => {
    if (attnTargets.length === 0) {
      notify('Selecione ao menos um responsável.');
      return;
    }
    void run(async () => {
      await api.signalResponsible(task.id, attnTargets);
      play('notify');
      setAttnOpen(false);
    }, 'Falha ao chamar atenção.');
  };

  const dismiss = () => run(async () => { await api.dismissAlert(task.id, task._etag); play('move'); }, 'Falha ao confirmar.');

  const saveEditComment = (commentId: string, authorEmail: string) => {
    const html = editRef.current?.innerHTML.trim() ?? '';
    const text = editRef.current?.textContent?.trim() ?? '';
    if (!text) {
      notify('O comentário não pode ficar vazio.');
      return;
    }
    void run(async () => {
      await api.editComment(task.id, commentId, html, authorEmail);
      setEditingId(null);
    }, 'Falha ao editar o comentário.');
  };
  const deleteCommentAt = (index: number) => {
    if (!window.confirm('Excluir este comentário?')) return;
    void run(() => api.deleteComment(task.id, index), 'Falha ao excluir o comentário.');
  };

  const addTaskAttachments = async (files: FileList | null) => {
    if (!files) return;
    const uploaded: Attachment[] = [];
    for (const file of Array.from(files)) {
      try {
        uploaded.push(await api.uploadAttachment(file));
      } catch {
        notify(`Falha ao anexar ${file.name}.`);
      }
    }
    if (attachRef.current) attachRef.current.value = '';
    if (uploaded.length === 0) return;
    void run(
      () => api.updateTask(task.id, { attachments: [...attachments, ...uploaded], expectedStatus: task.status, expectedEtag: task._etag }),
      'Falha ao salvar anexos.',
    );
  };
  const removeTaskAttachment = (index: number) => {
    void run(
      () => api.updateTask(task.id, { attachments: attachments.filter((_, i) => i !== index), expectedStatus: task.status, expectedEtag: task._etag }),
      'Falha ao remover o anexo.',
    );
  };

  const flow = buildTaskFlow(task);
  const alerts = Array.isArray(task.pendingAlerts) ? task.pendingAlerts : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Tarefa ${task.id}`} onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <div className="sb-row">
            <span className="modal__chip">#{task.id}</span>
            <StatusBadge status={task.status} />
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar" autoFocus>✕</button>
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
                    {comments.map((c, i) => {
                      const editable = canEditComment(c.author as PersonRef);
                      const isEditing = editingId === c.id;
                      const cAtts = Array.isArray(c.attachments) ? c.attachments : [];
                      return (
                        <li key={c.id} className="comment">
                          <Avatar person={typeof c.author === 'object' ? c.author : { email: '', name: String(c.author) }} small />
                          <div className="comment__main">
                            <div className="comment__who">
                              <strong>{personName(c.author as PersonRef)}</strong>
                              <small className="sb-meta">{fmt(c.timestamp)}{c.editedAt ? ' · editado' : ''}</small>
                            </div>
                            {isEditing ? (
                              <div className="comment__edit">
                                <div
                                  key={`edit-${c.id}`}
                                  ref={editRef}
                                  className="editor__area comment__editarea"
                                  contentEditable
                                  role="textbox"
                                  aria-multiline="true"
                                  suppressContentEditableWarning
                                  dangerouslySetInnerHTML={{ __html: c.text }}
                                />
                                <div className="sb-row">
                                  <button type="button" className="sb-button" disabled={busy} onClick={() => saveEditComment(c.id, myEmail)}>Salvar</button>
                                  <button type="button" className="sb-button sb-button--secondary" onClick={() => setEditingId(null)}>Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="comment__bubble">
                                  <Html className="comment__text" html={c.text} />
                                  {cAtts.length > 0 && (
                                    <div className="comment__atts">
                                      {cAtts.map((a, j) => (
                                        <a key={j} className="editor__attach-chip" href={a.url} target="_blank" rel="noreferrer">📄 {a.name}</a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {editable && (
                                  <div className="comment__actions">
                                    <button type="button" onClick={() => setEditingId(c.id)}>Editar</button>
                                    <button type="button" className="is-danger" onClick={() => deleteCommentAt(i)}>Excluir</button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <CommentEditor
                  users={users}
                  notify={notify}
                  onSubmit={(html, atts) => run(async () => { await api.addComment(task.id, { text: html, attachments: atts.length ? atts : undefined }); play('send'); }, 'Falha ao comentar.')}
                />
                <p className="sb-meta">Enter envia; Shift + Enter cria uma linha. Use @ para mencionar.</p>
              </div>
            )}

            {tab === 'anexos' && (
              <div className="tab-panel">
                <div className="form__attach-head">
                  <span className="sb-meta">{attachments.length} anexo(s) na tarefa</span>
                  <button type="button" className="sb-button sb-button--secondary" disabled={busy} onClick={() => attachRef.current?.click()}>+ Adicionar</button>
                  <input ref={attachRef} type="file" multiple hidden onChange={(e) => addTaskAttachments(e.target.files)} />
                </div>
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
                        <button type="button" className="attachment__del" disabled={busy} onClick={() => removeTaskAttachment(i)} aria-label="Remover anexo">🗑</button>
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
              <li className="flow__item">
                {flow.requester ? <Avatar person={flow.requester} small /> : <span className="flow__placeholder">NR</span>}
                <div>
                  <strong>{flow.requester?.name || 'Não registrado'}</strong>
                  <div className="sb-meta">Solicitante{flow.requester && task.createdAt ? ` · ${fmt(task.createdAt)}` : ''}</div>
                </div>
              </li>

              {flow.partial && <li className="flow__note sb-meta">Histórico parcial: trocas anteriores não registradas</li>}

              {flow.steps.map((step, idx) => {
                const isLast = idx === flow.steps.length - 1;
                return (
                  <li key={idx} className={`flow__stepbox${isLast ? ' is-current' : ''}`}>
                    {step.people.map((p, j) => {
                      const role = isLast && j === 0 ? 'Responsável principal' : 'Responsável';
                      const alert = alerts.find((a) => a.targetUser === p.name || a.targetUser === p.email);
                      return (
                        <div key={p.email || j} className="flow__person">
                          <Avatar person={p} small />
                          <div>
                            <strong>{p.name}</strong>
                            <div className="sb-meta">{role}{step.at ? ` · ${fmt(step.at)}` : ''}</div>
                            {alert && <div className="flow__alert">• Atenção solicitada {fmt(alert.timestamp)}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </li>
                );
              })}

              <li className="flow__item">
                {flow.homologador ? <Avatar person={flow.homologador} small /> : <span className="flow__placeholder">NI</span>}
                <div>
                  <strong>{flow.homologador?.name || 'Não informado'}</strong>
                  <div className="sb-meta">Homologador</div>
                </div>
              </li>
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
                <>
                  <button type="button" className="sb-button sb-button--secondary" disabled={busy} onClick={toggleAttn}>📣 Chamar atenção</button>
                  {attnOpen && (
                    <div className="forward-form">
                      {responsibles.map((r) => {
                        const nm = personName(r);
                        return (
                          <label key={nm} className="checkline">
                            <input
                              type="checkbox"
                              checked={attnTargets.includes(nm)}
                              onChange={(e) => setAttnTargets((prev) => (e.target.checked ? [...prev, nm] : prev.filter((x) => x !== nm)))}
                            />{' '}
                            {nm}
                          </label>
                        );
                      })}
                      <button type="button" className="sb-button" disabled={busy} onClick={confirmAttn}>Sinalizar</button>
                    </div>
                  )}
                </>
              )}
              {myAlert && (
                <button type="button" className="sb-button" disabled={busy} onClick={dismiss}>👀 Vou olhar</button>
              )}
              <button type="button" className="sb-button sb-button--secondary" onClick={() => notify('Marcar reunião: integração de calendário chega num próximo passo.')}>📅 Marcar reunião</button>
            </div>
          </aside>
        </div>

        <footer className="modal__foot">
          <span className="sb-meta">Alterações e comentários usam as ações desta tarefa.</span>
          <div className="sb-row">
            <button type="button" className="sb-button sb-button--secondary" onClick={onClose}>✕ Fechar</button>
            <button type="button" className="sb-button" onClick={onEdit}>✎ Editar tarefa</button>
          </div>
        </footer>
      </div>
    </div>
  );

  void currentUser; // reservado para restringir ações ao homologador designado (fase live)
}

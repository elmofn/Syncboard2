import { useRef, useState } from 'react';
import type { Task, User, Attachment, Person } from '../types/api';
import { personName, personEmail } from '../types/api';
import { api } from '../lib/api';
import { useEscape } from '../lib/useEscape';
import { play } from '../lib/sound';
import { BOARD_COLUMNS, STATUS_META } from '../lib/status';
import { AiTitleModal } from './AiTitleModal';
import { CalendarBlank, Flag, FloppyDisk, Folder, Kanban, Paperclip, ShieldCheck, Sparkle, Users, X } from '@phosphor-icons/react';

const PRIORITIES = ['Baixa', 'Média', 'Alta'];
const DEFAULT_COLOR = '#526D82';

interface Props {
  mode: 'create' | 'edit';
  task?: Task;
  users: User[];
  onClose: () => void;
  notify: (msg: string) => void;
}

function toPersons(refs: Task['responsible'] | undefined): Person[] {
  if (!Array.isArray(refs)) return [];
  return refs.map((r) => (typeof r === 'object' ? { email: r.email, name: r.name } : { email: '', name: r }));
}

export function TaskForm({ mode, task, users, onClose, notify }: Props) {
  const isEdit = mode === 'edit';
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [azureLink, setAzureLink] = useState(task?.azureLink ?? '');
  const [responsible, setResponsible] = useState<Person[]>(toPersons(task?.responsible));
  const [homologador, setHomologador] = useState(personEmail(task?.homologador));
  const [status, setStatus] = useState(task?.status ?? 'todo');
  const [project, setProject] = useState(task?.project ?? '');
  const [projectColor, setProjectColor] = useState(task?.projectColor || DEFAULT_COLOR);
  const [priority, setPriority] = useState(task?.priority || 'Média');
  const [noDate, setNoDate] = useState(!task?.dueDate);
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [attachments, setAttachments] = useState<Attachment[]>(task?.attachments ?? []);
  const [aiOpen, setAiOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEscape(onClose);

  const addResponsible = (email: string) => {
    const u = users.find((x) => x.email === email);
    if (!u || responsible.some((r) => r.email === u.email)) return;
    setResponsible((prev) => [...prev, { email: u.email, name: u.name }]);
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const att = await api.uploadAttachment(file);
        setAttachments((prev) => [...prev, att]);
      } catch {
        notify(`Falha ao anexar ${file.name}.`);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = async () => {
    if (!title.trim() || !description.trim() || responsible.length === 0) {
      notify('Título, descrição e ao menos um responsável são obrigatórios.');
      return;
    }
    const resolvedDue = noDate ? null : dueDate || null;
    const homologadorRef = (() => {
      if (!homologador) return null;
      const u = users.find((x) => x.email === homologador);
      return u ? { email: u.email, name: u.name } : null;
    })();
    setSaving(true);
    try {
      if (isEdit && task) {
        await api.updateTask(task.id, {
          title: title.trim(),
          description: description.trim(),
          azureLink,
          responsible,
          homologador: homologadorRef,
          status,
          project,
          projectColor,
          priority,
          dueDate: resolvedDue,
          attachments,
          expectedStatus: task.status,
          expectedEtag: task._etag,
        });
      } else {
        await api.createTask({
          title: title.trim(),
          description: description.trim(),
          responsible,
          homologador: homologadorRef,
          azureLink,
          project,
          projectColor,
          priority,
          dueDate: resolvedDue,
          attachments,
        });
      }
      play('success');
      onClose();
    } catch (e) {
      play('error');
      notify(e instanceof Error ? e.message : 'Falha ao salvar a tarefa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={isEdit ? 'Editar tarefa' : 'Nova tarefa'} onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <div className="sb-row">
            <span className="modal__chip">TAREFA</span>
            <span className="modal__chip modal__chip--active">{isEdit ? 'EDITAR TAREFA' : 'NOVA TAREFA'}</span>
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar"><X /></button>
        </header>

        <div className="modal__body">
          <div className="modal__left form">
            <label className="field">
              <span className="sb-label">Título <small className="sb-meta">(obrigatório)</small></span>
              <input className="sb-input form__title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Digite o título da tarefa…" />
            </label>
            <button type="button" className="sb-button ai-btn" onClick={() => setAiOpen(true)} disabled={!title.trim()}>
              <Sparkle /> Melhorar título com IA
            </button>

            <label className="field form__sep">
              <span className="sb-label">Descrição <small className="sb-meta">(obrigatória)</small></span>
              <textarea className="sb-textarea form__desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva os detalhes e requisitos da tarefa…" />
            </label>

            <div className="field form__sep">
              <div className="form__attach-head">
                <span className="sb-label sb-label--section"><Paperclip /> Anexos</span>
                <button type="button" className="sb-button ai-btn form__add" onClick={() => fileRef.current?.click()}>+ Adicionar</button>
                <input ref={fileRef} type="file" multiple hidden onChange={(e) => onPickFiles(e.target.files)} />
              </div>
              {attachments.length === 0 ? (
                <p className="sb-meta">Ao salvar, o sistema tentará enviar os arquivos selecionados. Um arquivo com link não confirma que as alterações foram salvas.</p>
              ) : (
                <ul className="attachments">
                  {attachments.map((a, i) => (
                    <li key={i} className="attachment">
                      <span className="attachment__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></svg>
                      </span>
                      <div>
                        <strong>{a.name}</strong>
                        <small className="sb-meta">Selecionado neste formulário</small>
                      </div>
                      <button type="button" className="attachment__del" onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} aria-label="Remover anexo">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <aside className="modal__right form">
            <label className="field">
              <span className="sb-label">Link DevOps / externo</span>
              <input className="sb-input" value={azureLink} onChange={(e) => setAzureLink(e.target.value)} placeholder="Link DevOps / Externo…" />
              <small className="sb-meta">Referência externa opcional.</small>
            </label>

            <div className="field form__sep">
              <span className="sb-label"><Users /> Responsáveis</span>
              <div className="chips">
                {responsible.map((r, i) => (
                  <span key={r.email || i} className="chip-person">
                    {personName(r)}
                    <button type="button" onClick={() => setResponsible((p) => p.filter((_, j) => j !== i))} aria-label="Remover"><X /></button>
                  </span>
                ))}
              </div>
              <select className="sb-select" value="" onChange={(e) => e.target.value && addResponsible(e.target.value)}>
                <option value="">Adicionar…</option>
                {users.filter((u) => u.email && !responsible.some((r) => r.email === u.email)).map((u) => (
                  <option key={u.email} value={u.email}>{u.name}</option>
                ))}
              </select>
              <small className="sb-meta">Adicione uma ou mais pessoas. A primeira é a responsável principal.</small>
            </div>

            <label className="field">
              <span className="sb-label"><ShieldCheck /> Homologador <small className="sb-meta">(opcional)</small></span>
              <select className="sb-select" value={homologador} onChange={(e) => setHomologador(e.target.value)}>
                <option value="">Definir depois</option>
                {users.filter((u) => u.email).map((u) => (
                  <option key={u.email} value={u.email}>{u.name}</option>
                ))}
              </select>
              <small className="sb-meta">Você pode definir agora ou depois. A escolha será confirmada ao enviar para Homologação.</small>
            </label>

            {isEdit && (
              <label className="field">
                <span className="sb-label"><Kanban /> Status</span>
                <select className="sb-select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                  {BOARD_COLUMNS.map((s) => (
                    <option key={s} value={s}>{STATUS_META[s].label}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="field">
              <span className="sb-label"><Folder /> Projeto</span>
              <div className="form__project">
                <input className="sb-input" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Projeto" />
                <input type="color" className="form__color" value={projectColor} onChange={(e) => setProjectColor(e.target.value)} aria-label="Cor do projeto" />
              </div>
            </div>

            <label className="field">
              <span className="sb-label"><Flag /> Prioridade</span>
              <select className="sb-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>

            <div className="field">
              <div className="form__prazo-head">
                <span className="sb-label"><CalendarBlank /> Prazo</span>
                <label className="sb-meta form__nodate">
                  <input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} /> Sem data
                </label>
              </div>
              <input className="sb-input" type="date" value={dueDate ?? ''} disabled={noDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </aside>
        </div>

        <footer className="modal__foot">
          <span className="sb-meta">As alterações só são enviadas ao salvar. Ao sair, edições não salvas podem ser perdidas.</span>
          <div className="sb-row">
            <button type="button" className="sb-button sb-button--secondary" onClick={onClose}>Cancelar</button>
            <button type="button" className="sb-button" onClick={save} disabled={saving}><FloppyDisk /> {saving ? 'Salvando…' : 'Salvar Tarefa'}</button>
          </div>
        </footer>
      </div>

      {aiOpen && (
        <AiTitleModal
          original={title}
          onApply={(t) => setTitle(t)}
          onClose={() => setAiOpen(false)}
        />
      )}
    </div>
  );
}

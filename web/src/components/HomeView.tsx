import { useState } from 'react';
import type { Task, TaskStatus, ClientPrincipal } from '../types/api';
import { personEmail, personName } from '../types/api';
import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { ArrowUpRight, Diamond, Pause, Play, SquaresFour, Tray } from '@phosphor-icons/react';
import { STATUS_META } from '../lib/status';
import { StatusBadge } from './StatusBadge';

interface Props {
  tasks: Task[];
  user: ClientPrincipal;
  onOpen: (task: Task) => void;
  onGoHomologacao: () => void;
}

type Tab = TaskStatus | 'atrasadas';

const STATUS_FG: Record<string, string> = {
  todo: 'var(--sb-status-todo-fg)',
  stopped: 'var(--sb-status-stopped-fg)',
  inprogress: 'var(--sb-status-inprogress-fg)',
  homologation: 'var(--sb-status-homologation-fg)',
  publication: 'var(--sb-status-publication-fg)',
};

const dueTime = (t: Task) => (t.dueDate ? new Date(t.dueDate).getTime() : Number.POSITIVE_INFINITY);

export function HomeView({ tasks, user, onOpen, onGoHomologacao }: Props) {
  const name = user.claims?.find((c) => c.typ === 'name')?.val || user.userDetails;
  const email = user.userDetails.toLowerCase();

  const isMine = (t: Task) => {
    const resp = Array.isArray(t.responsible) ? t.responsible : [];
    const asResp = resp.some((r) => personEmail(r).toLowerCase() === email || personName(r).toLowerCase() === name.toLowerCase());
    const asHomolog = t.status === 'homologation' && personEmail(t.homologador).toLowerCase() === email;
    return asResp || asHomolog;
  };
  const recorte = tasks.filter(isMine);

  const now = Date.now();
  const countBy = (s: TaskStatus) => recorte.filter((t) => t.status === s).length;
  const atrasadas = recorte.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now);
  const pendingHomolog = recorte.filter((t) => t.status === 'homologation' && personEmail(t.homologador).toLowerCase() === email);

  const kpis = [
    { icon: SquaresFour as ComponentType<IconProps>, label: 'Tarefas ativas', value: recorte.length, sub: 'No seu recorte pessoal' },
    { icon: Pause as ComponentType<IconProps>, label: 'Parado', value: countBy('stopped'), sub: 'Estado registrado na tarefa' },
    { icon: Diamond as ComponentType<IconProps>, label: 'Em homologação', value: countBy('homologation'), sub: 'Aguardam validação' },
    { icon: ArrowUpRight as ComponentType<IconProps>, label: 'Em publicação', value: countBy('publication'), sub: 'Ainda não concluídas' },
  ];

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'todo', label: 'Fila', count: countBy('todo') },
    { key: 'stopped', label: 'Parado', count: countBy('stopped') },
    { key: 'inprogress', label: 'Andamento', count: countBy('inprogress') },
    { key: 'homologation', label: 'Homologação', count: countBy('homologation') },
    { key: 'publication', label: 'Publicação', count: countBy('publication') },
    { key: 'atrasadas', label: 'Atrasadas', count: atrasadas.length },
  ];
  const [tab, setTab] = useState<Tab>('inprogress');
  const selected = (tab === 'atrasadas' ? atrasadas : recorte.filter((t) => t.status === tab)).sort(
    (a, b) => dueTime(a) - dueTime(b),
  );

  const projects = [...recorte.reduce((m, t) => (t.project ? m.set(t.project, (m.get(t.project) ?? 0) + 1) : m), new Map<string, number>())];

  const distStatuses: TaskStatus[] = ['todo', 'stopped', 'inprogress', 'homologation', 'publication'];

  return (
    <div className="home">
      <div className="home__kpis">
        {kpis.map((k) => {
          const KIcon = k.icon;
          return (
          <div key={k.label} className="kpi">
            <span className="kpi__top"><KIcon /> {k.label}</span>
            <span className="kpi__value">{k.value}</span>
            <span className="kpi__sub">{k.sub}</span>
          </div>
          );
        })}
      </div>
      <p className="home__note">
        Resumo das tarefas carregadas em que você é responsável ou homologador pendente. Os números não representam um total global.
      </p>

      <div className="home__main">
        <div className="home__left">
          <div className="home__section-head">
            <h2><Play /> Tarefas em Andamento</h2>
            <span className="sb-meta">{selected.length} tarefas neste recorte</span>
          </div>

          <div className="home__tabs">
            {TABS.map((t) => (
              <button key={t.key} type="button" className={`home__tab${tab === t.key ? ' is-active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label} <span className="home__tab-count">{t.count}</span>
              </button>
            ))}
          </div>
          <p className="home__hint">Ordenadas pelo prazo mais próximo; tarefas sem prazo ficam ao final.</p>

          <div className="home__listbox">
            {selected.length === 0 ? (
              <div className="home-empty">
                <Tray aria-hidden="true" size={28} />
                <strong>Nenhuma tarefa nesta seleção</strong>
                <span className="sb-meta">Escolha outra etapa para consultar as suas tarefas.</span>
              </div>
            ) : (
              <ul className="home__tasks">
                {selected.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="home__task" onClick={() => onOpen(t)}>
                      <span className="sb-meta">{t.id}</span>
                      <strong>{t.title}</strong>
                      <span className="sb-meta">{t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-BR') : 'Sem prazo'}</span>
                      <StatusBadge status={t.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="dist sb-card">
            <div className="home__section-head">
              <strong>Distribuição do trabalho</strong>
              <span className="sb-meta">{recorte.length} tarefas no recorte</span>
            </div>
            <div className="dist__bar">
              {distStatuses.map((s) => {
                const n = countBy(s);
                if (n === 0) return null;
                return <div key={s} className="dist__seg" style={{ flex: n, background: STATUS_FG[s] }} title={`${STATUS_META[s].label}: ${n}`} />;
              })}
            </div>
            <div className="dist__legend">
              {distStatuses.map((s) => (
                <span key={s} className="dist__legend-item">
                  <span className="dist__dot" style={{ background: STATUS_FG[s] }} />
                  {STATUS_META[s].label} <strong>{countBy(s)}</strong>
                </span>
              ))}
            </div>
          </div>
        </div>

        <aside className="home__right">
          <h2 className="home__right-title">Precisa de atenção</h2>
          {pendingHomolog.length > 0 ? (
            <div className="attn sb-card">
              <span className="attn__icon"><Diamond /></span>
              <strong>{pendingHomolog.length} · Aguardando sua homologação</strong>
              <span className="sb-meta">Sua validação está pendente nestas tarefas.</span>
              <button type="button" className="attn__link" onClick={onGoHomologacao}>Ver homologação</button>
            </div>
          ) : (
            <div className="attn sb-card">
              <span className="sb-meta">Nada pendente para você no momento.</span>
            </div>
          )}

          <div className="attn sb-card">
            <strong>Seus projetos</strong>
            {projects.length === 0 ? (
              <span className="sb-meta">Sem participação em projetos neste recorte.</span>
            ) : (
              <ul className="home__projects">
                {projects.map(([p, n]) => (
                  <li key={p} className="home__project">
                    <span>{p}</span>
                    <strong>{n}</strong>
                  </li>
                ))}
              </ul>
            )}
            <span className="sb-meta">Participação nas tarefas deste recorte.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

import type { Task, Notification, ProjectCount, ClientPrincipal } from '../types/api';
import { personEmail, personName } from '../types/api';
import { StatusBadge } from './StatusBadge';

interface Props {
  tasks: Task[];
  projects: ProjectCount[];
  notifications: Notification[];
  user: ClientPrincipal;
  onOpen: (task: Task) => void;
}

export function HomeView({ tasks, projects, notifications, user, onOpen }: Props) {
  const name = user.claims?.find((c) => c.typ === 'name')?.val || user.userDetails;
  const firstName = name.split(/\s+/)[0];
  const email = user.userDetails.toLowerCase();

  const mine = tasks.filter((t) =>
    (Array.isArray(t.responsible) ? t.responsible : []).some(
      (r) => personEmail(r).toLowerCase() === email || personName(r).toLowerCase() === name.toLowerCase(),
    ),
  );
  const unread = notifications.filter((n) => !n.isRead).length;
  const homolog = tasks.filter((t) => t.status === 'homologation').length;

  const kpis = [
    { label: 'Tarefas ativas', value: tasks.length },
    { label: 'Minhas tarefas', value: mine.length },
    { label: 'Em homologação', value: homolog },
    { label: 'Notificações', value: unread },
  ];

  return (
    <div className="home">
      <p className="home__hello">Olá, {firstName} 👋</p>

      <div className="home__kpis">
        {kpis.map((k) => (
          <div key={k.label} className="kpi sb-card">
            <span className="kpi__value">{k.value}</span>
            <span className="kpi__label sb-meta">{k.label}</span>
          </div>
        ))}
      </div>

      <div className="home__cols">
        <section className="home__panel">
          <h2>Minhas tarefas</h2>
          {mine.length === 0 ? (
            <p className="empty-box sb-meta">Você não tem tarefas ativas atribuídas.</p>
          ) : (
            <ul className="home__tasks">
              {mine.map((t) => (
                <li key={t.id}>
                  <button type="button" className="home__task" onClick={() => onOpen(t)}>
                    <span className="sb-meta">{t.id}</span>
                    <strong>{t.title}</strong>
                    <StatusBadge status={t.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="home__panel">
          <h2>Projetos</h2>
          {projects.length === 0 ? (
            <p className="empty-box sb-meta">Nenhum projeto.</p>
          ) : (
            <ul className="home__projects">
              {projects.map((p) => (
                <li key={p.project} className="home__project">
                  <span>{p.project}</span>
                  <span className="sb-meta">{p.active} ativas · {p.total} no total</span>
                </li>
              ))}
            </ul>
          )}
          <h2 className="home__statuses-title">Por etapa</h2>
          <ul className="home__statuses">
            {(['todo', 'stopped', 'inprogress', 'homologation', 'publication'] as const).map((s) => (
              <li key={s} className="home__status">
                <StatusBadge status={s} />
                <span className="sb-meta">{tasks.filter((t) => t.status === s).length}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

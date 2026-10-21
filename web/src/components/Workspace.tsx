import { useEffect, useMemo, useState } from 'react';
import type { ClientPrincipal, Notification, ProjectCount, Task, TaskStatus, User } from '../types/api';
import { personEmail } from '../types/api';
import { api } from '../lib/api';
import { useTasks } from '../hooks/useTasks';
import { EMPTY_FILTERS, filterTasks, type Filters } from '../lib/filter';
import { VIEW_LABEL, type View } from '../lib/views';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CubeSpinner } from './CubeSpinner';
import { WorkHeader } from './WorkHeader';
import { FilterBar } from './FilterBar';
import { Board } from './Board';
import { ListView } from './ListView';
import { TaskDetail } from './TaskDetail';
import { TaskForm } from './TaskForm';
import { PeopleView } from './PeopleView';
import { HomeView } from './HomeView';
import { HomologadorModal } from './HomologadorModal';
import { AlertModal, type IncomingAlert } from './AlertModal';
import { play } from '../lib/sound';

const HEADER: Record<View, { title: string; subtitle: string }> = {
  home: { title: 'Home', subtitle: 'Um resumo do seu trabalho.' },
  quadro: { title: 'Quadro de trabalho', subtitle: 'Da fila à publicação, com cada etapa à vista.' },
  lista: { title: 'Lista de tarefas', subtitle: 'Todas as tarefas ativas, organizadas em uma só visão.' },
  arquivados: { title: 'Arquivados', subtitle: 'Tarefas concluídas.' },
  pessoas: { title: 'Pessoas', subtitle: 'Gerencie os usuários do workspace.' },
};

export function Workspace({ user }: { user: ClientPrincipal }) {
  const { tasks, error, moveTask, reorderTask } = useTasks();
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<ProjectCount[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [archived, setArchived] = useState<Task[] | null>(null);
  const [view, setView] = useState<View>('quadro');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; task: Task } | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [homologAction, setHomologAction] = useState<
    | { type: 'move'; id: string }
    | { type: 'reorder'; id: string; order: number; prevStatus: TaskStatus; etag?: string }
    | null
  >(null);
  const go = (v: View) => {
    setView(v);
    setNavOpen(false);
  };

  // Ao mover para Homologação sem homologador definido, pede quem vai homologar.
  const needsHomologador = (id: string) => {
    const t = (tasks ?? []).find((x) => x.id === id);
    return !!t && !personEmail(t.homologador);
  };
  const handleMove = (id: string, status: TaskStatus) => {
    if (status === 'homologation' && needsHomologador(id)) {
      setHomologAction({ type: 'move', id });
      return;
    }
    moveTask(id, status);
  };
  const handleReorder = (id: string, status: TaskStatus, order: number, prevStatus?: TaskStatus, etag?: string) => {
    if (status === 'homologation' && prevStatus && prevStatus !== status && needsHomologador(id)) {
      setHomologAction({ type: 'reorder', id, order, prevStatus, etag });
      return;
    }
    reorderTask(id, status, order, prevStatus, etag);
  };
  const confirmHomologador = (person: { email: string; name: string }) => {
    const a = homologAction;
    if (!a) return;
    setHomologAction(null);
    if (a.type === 'move') moveTask(a.id, 'homologation', { homologador: person });
    else reorderTask(a.id, 'homologation', a.order, a.prevStatus, a.etag, { homologador: person });
  };

  // Alertas de "Atenção Solicitada" direcionados a mim, exibidos um a um.
  const [skippedAlerts, setSkippedAlerts] = useState<Set<string>>(new Set());
  const [ackingAlert, setAckingAlert] = useState(false);
  const myName = user.claims?.find((c) => c.typ === 'name')?.val || user.userDetails;
  const myEmail = user.userDetails.toLowerCase();
  const incomingAlerts = useMemo<IncomingAlert[]>(() => {
    const list: IncomingAlert[] = [];
    for (const t of tasks ?? []) {
      for (const a of t.pendingAlerts ?? []) {
        if (a.acknowledgedAt) continue;
        if (a.targetUser === myName || a.targetUser.toLowerCase() === myEmail) {
          list.push({ key: `${t.id}|${a.timestamp}`, taskId: t.id, taskTitle: t.title, signaledBy: a.signaledBy, etag: t._etag });
        }
      }
    }
    return list;
  }, [tasks, myName, myEmail]);
  const pendingAlerts = incomingAlerts.filter((a) => !skippedAlerts.has(a.key));
  const activeAlert = pendingAlerts[0];

  useEffect(() => {
    if (activeAlert) play('notify');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAlert?.key]);

  const ackAlert = async () => {
    if (!activeAlert) return;
    setAckingAlert(true);
    try {
      await api.dismissAlert(activeAlert.taskId, activeAlert.etag);
      setOpenId(activeAlert.taskId);
    } catch {
      flash('Falha ao confirmar o alerta.');
    } finally {
      setAckingAlert(false);
    }
  };

  const reloadUsers = () => api.getUsers().then(setUsers).catch(() => undefined);

  useEffect(() => {
    reloadUsers();
    api.getNotifications().then(setNotifications).catch(() => undefined);
  }, []);

  // Recarrega contagens de projeto quando a lista de tarefas muda.
  useEffect(() => {
    api.getProjectTaskCounts().then(setProjects).catch(() => undefined);
  }, [tasks]);

  useEffect(() => {
    if (view === 'arquivados' && archived === null) {
      api.getArchivedTasks().then(setArchived).catch(() => setArchived([]));
    }
  }, [view, archived]);

  const activeTasks = tasks ?? [];
  const filtered = useMemo(() => filterTasks(activeTasks, filters), [activeTasks, filters]);
  const openTask = openId ? [...activeTasks, ...(archived ?? [])].find((t) => t.id === openId) ?? null : null;

  const projectNames = projects.length
    ? projects.map((p) => p.project)
    : [...new Set(activeTasks.map((t) => t.project).filter(Boolean))];
  const userNames = [...new Set(users.filter((u) => u.email).map((u) => u.name))];
  const priorities = [...new Set(activeTasks.map((t) => t.priority).filter(Boolean))];

  const showFilters = view === 'quadro' || view === 'lista';
  const greet = () => {
    const h = new Date().getHours();
    const base = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const first = (user.claims?.find((c) => c.typ === 'name')?.val || user.userDetails).split(/\s+/)[0];
    return `${base}, ${first}!`;
  };
  const header =
    view === 'home'
      ? { title: greet(), subtitle: 'O trabalho em curso e o que precisa da sua atenção.' }
      : HEADER[view];
  const goHomologacao = () => {
    setFilters((f) => ({ ...f, status: 'homologation' }));
    setView('quadro');
  };

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3200);
  };

  const markNotification = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    api.markNotificationRead(id).catch(() => undefined);
  };

  return (
    <div className="workspace">
      <Sidebar
        user={user}
        view={view}
        onNavigate={go}
        open={navOpen}
        projects={projects}
        activeCount={activeTasks.length}
        activeProject={filters.project}
        onSelectProject={(project) => {
          setFilters((f) => ({ ...f, project }));
          if (view !== 'quadro' && view !== 'lista') setView('quadro');
          setNavOpen(false);
        }}
      />
      {navOpen && <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} />}

      <div className="workspace__main">
        <TopBar
          user={user}
          crumb={VIEW_LABEL[view]}
          notifications={notifications}
          onMarkRead={markNotification}
          onOpenTask={(taskId) => setOpenId(taskId)}
          onToggleSidebar={() => setNavOpen((v) => !v)}
        />

        <div className="workspace__content">
          <WorkHeader
            title={header.title}
            subtitle={header.subtitle}
            onNewTask={showFilters || view === 'home' ? () => setForm({ mode: 'create' }) : undefined}
          />

          {showFilters && (
            <>
              <FilterBar
                filters={filters}
                projects={projectNames}
                users={userNames}
                priorities={priorities}
                onChange={setFilters}
              />
              <div className="controlrow">
                <span className="sb-meta">{filtered.length} tarefas encontradas</span>
                <div className="controlrow__right">
                  <span className="sb-meta">Criação · decrescente</span>
                  <div className="viewtoggle" role="tablist" aria-label="Modo de visualização">
                    <button
                      type="button"
                      className={view === 'quadro' ? 'is-active' : ''}
                      onClick={() => setView('quadro')}
                    >
                      ▦ Quadro
                    </button>
                    <button
                      type="button"
                      className={view === 'lista' ? 'is-active' : ''}
                      onClick={() => setView('lista')}
                    >
                      ☰ Lista
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {error && <div className="workspace__notice workspace__notice--error">{error}</div>}

          {view === 'quadro' &&
            (tasks === null ? <LoadingBox /> : <Board tasks={filtered} moveTask={handleMove} reorderTask={handleReorder} onOpen={(t) => setOpenId(t.id)} notify={flash} />)}
          {view === 'lista' && (tasks === null ? <LoadingBox /> : <ListView tasks={filtered} onOpen={(t) => setOpenId(t.id)} />)}
          {view === 'arquivados' && (archived === null ? <LoadingBox /> : <ListView tasks={archived} onOpen={(t) => setOpenId(t.id)} />)}
          {view === 'pessoas' && (
            <PeopleView
              users={users}
              canManage={user.userRoles.includes('admin')}
              currentEmail={user.userDetails}
              onChanged={reloadUsers}
              notify={flash}
            />
          )}
          {view === 'home' && (tasks === null ? <LoadingBox /> : <HomeView tasks={activeTasks} user={user} onOpen={(t) => setOpenId(t.id)} onGoHomologacao={goHomologacao} />)}
        </div>
      </div>

      {openTask && (
        <TaskDetail
          task={openTask}
          users={users}
          currentUser={user}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setForm({ mode: 'edit', task: openTask });
            setOpenId(null);
          }}
          notify={flash}
        />
      )}

      {form && (
        <TaskForm
          mode={form.mode}
          task={form.mode === 'edit' ? form.task : undefined}
          users={users}
          onClose={() => setForm(null)}
          notify={flash}
        />
      )}

      {activeAlert && (
        <AlertModal
          alert={activeAlert}
          queueCount={pendingAlerts.length - 1}
          busy={ackingAlert}
          onAck={ackAlert}
          onSkip={() => setSkippedAlerts((prev) => new Set(prev).add(activeAlert.key))}
        />
      )}

      {homologAction && (
        <HomologadorModal
          users={users}
          onConfirm={confirmHomologador}
          onClose={() => setHomologAction(null)}
        />
      )}

      {notice && (
        <div className="workspace__toast" role="status" aria-live="polite">
          {notice}
        </div>
      )}
    </div>
  );
}

function LoadingBox() {
  return (
    <div className="loading-box sb-meta">
      <CubeSpinner size={30} /> Carregando…
    </div>
  );
}

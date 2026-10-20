import { useEffect, useMemo, useState } from 'react';
import type { ClientPrincipal, Notification, ProjectCount, Task, User } from '../types/api';
import { api } from '../lib/api';
import { useTasks } from '../hooks/useTasks';
import { EMPTY_FILTERS, filterTasks, type Filters } from '../lib/filter';
import { VIEW_LABEL, type View } from '../lib/views';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { WorkHeader } from './WorkHeader';
import { FilterBar } from './FilterBar';
import { Board } from './Board';
import { ListView } from './ListView';
import { TaskDetail } from './TaskDetail';
import { TaskForm } from './TaskForm';

const HEADER: Record<View, { title: string; subtitle: string }> = {
  home: { title: 'Home', subtitle: 'Um resumo do seu trabalho.' },
  quadro: { title: 'Quadro de trabalho', subtitle: 'Da fila à publicação, com cada etapa à vista.' },
  lista: { title: 'Lista de tarefas', subtitle: 'Todas as tarefas ativas, organizadas em uma só visão.' },
  arquivados: { title: 'Arquivados', subtitle: 'Tarefas concluídas.' },
};

export function Workspace({ user }: { user: ClientPrincipal }) {
  const { tasks, error, moveTask } = useTasks();
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<ProjectCount[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [archived, setArchived] = useState<Task[] | null>(null);
  const [view, setView] = useState<View>('quadro');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; task: Task } | null>(null);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(() => undefined);
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
  const header = HEADER[view];

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3200);
  };

  return (
    <div className="workspace">
      <Sidebar
        user={user}
        view={view}
        onNavigate={setView}
        projects={projects}
        activeCount={activeTasks.length}
        activeProject={filters.project}
        onSelectProject={(project) => {
          setFilters((f) => ({ ...f, project }));
          if (view !== 'quadro' && view !== 'lista') setView('quadro');
        }}
      />

      <div className="workspace__main">
        <TopBar user={user} crumb={VIEW_LABEL[view]} notifications={notifications} />

        <div className="workspace__content">
          <WorkHeader
            title={header.title}
            subtitle={header.subtitle}
            onNewTask={showFilters ? () => setForm({ mode: 'create' }) : undefined}
          />

          {notice && <div className="workspace__notice">{notice}</div>}

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

          {view === 'quadro' && <Board tasks={filtered} moveTask={moveTask} onOpen={(t) => setOpenId(t.id)} />}
          {view === 'lista' && <ListView tasks={filtered} onOpen={(t) => setOpenId(t.id)} />}
          {view === 'arquivados' && <ListView tasks={archived ?? []} onOpen={(t) => setOpenId(t.id)} />}
          {view === 'home' && <p className="sb-meta">Home chega em um próximo passo.</p>}
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
    </div>
  );
}

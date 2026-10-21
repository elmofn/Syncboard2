import { SignOut, SquaresFour } from '@phosphor-icons/react';
import type { ClientPrincipal, ProjectCount } from '../types/api';
import type { View } from '../lib/views';
import { logout } from '../lib/auth';
import { Avatar } from './Avatar';

const PROJECT_DOTS = ['#244FDB', '#713AA3', '#17674D', '#8C5000', '#A62A24'];

interface Props {
  user: ClientPrincipal;
  view: View;
  onNavigate: (view: View) => void;
  projects: ProjectCount[];
  activeCount: number;
  activeProject: string;
  onSelectProject: (project: string) => void;
  open?: boolean;
}

function userName(user: ClientPrincipal): string {
  return user.claims?.find((c) => c.typ === 'name')?.val || user.userDetails;
}

export function Sidebar({ user, view, onNavigate, projects, activeCount, activeProject, onSelectProject, open }: Props) {
  const name = userName(user);
  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`}>
      <div className="sidebar__brand">
        <img src="/brand/mark-primary.svg" alt="" width={28} height={28} />
        <strong>SyncBOARD</strong>
      </div>

      <button type="button" className="sidebar__selector">
        <span className="sidebar__selector-badge">NT</span>
        <span>
          <small>WORKSPACE</small>
          SyncBoard NT
        </span>
      </button>
      <button type="button" className="sidebar__selector">
        <span className="sidebar__selector-badge sidebar__selector-badge--board"><SquaresFour /></span>
        <span>
          <small>BOARD</small>
          Quadro de trabalho
        </span>
      </button>

      <nav className="sidebar__section">
        <p className="sidebar__section-title">Trabalho</p>
        <NavItem label="Home" active={view === 'home'} onClick={() => onNavigate('home')} />
        <NavItem label="Quadro" active={view === 'quadro'} onClick={() => onNavigate('quadro')} badge={activeCount} />
        <NavItem label="Lista" active={view === 'lista'} onClick={() => onNavigate('lista')} />
        <NavItem label="Arquivados" active={view === 'arquivados'} onClick={() => onNavigate('arquivados')} />
      </nav>

      <nav className="sidebar__section">
        <p className="sidebar__section-title">Projetos</p>
        {projects.length === 0 && <p className="sidebar__empty sb-meta">Sem projetos</p>}
        {projects.map((p, i) => (
          <button
            key={p.project}
            type="button"
            className={`sidebar__project${activeProject === p.project ? ' is-active' : ''}`}
            onClick={() => onSelectProject(activeProject === p.project ? '' : p.project)}
          >
            <span className="sidebar__dot" style={{ background: PROJECT_DOTS[i % PROJECT_DOTS.length] }} />
            <span className="sidebar__project-name">{p.project}</span>
            <span className="sb-meta">
              {p.active}/{p.total}
            </span>
          </button>
        ))}
      </nav>

      <nav className="sidebar__section">
        <p className="sidebar__section-title">Configuração</p>
        <NavItem label="Workspace" onClick={() => undefined} muted />
        <NavItem label="Boards" onClick={() => undefined} muted />
        <NavItem label="Users" active={view === 'pessoas'} onClick={() => onNavigate('pessoas')} />
      </nav>

      <div className="sidebar__user">
        <Avatar person={{ email: user.userDetails, name }} small />
        <span className="sidebar__user-info">
          <strong>{name}</strong>
          <small>{user.claims?.find((c) => c.typ === 'role')?.val || 'Membro'}</small>
        </span>
        <button type="button" className="sidebar__logout" title="Sair" onClick={logout} aria-label="Sair">
          <SignOut />
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  label,
  active,
  onClick,
  badge,
  muted,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: number;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      className={`sidebar__nav${active ? ' is-active' : ''}${muted ? ' is-muted' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      {typeof badge === 'number' && <span className="sidebar__nav-badge">{badge}</span>}
    </button>
  );
}

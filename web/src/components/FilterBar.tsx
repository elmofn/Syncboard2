import type { Filters } from '../lib/filter';
import { hasActiveFilters, EMPTY_FILTERS } from '../lib/filter';
import { BOARD_COLUMNS, STATUS_META } from '../lib/status';

interface Props {
  filters: Filters;
  projects: string[];
  users: string[];
  priorities: string[];
  onChange: (next: Filters) => void;
}

export function FilterBar({ filters, projects, users, priorities, onChange }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  return (
    <div className="filterbar">
      <div className="filterbar__search">
        <span aria-hidden="true">🔍</span>
        <input
          className="filterbar__input"
          placeholder="Buscar por título ou ID"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
        />
      </div>
      <select className="sb-select filterbar__select" value={filters.project} onChange={(e) => set({ project: e.target.value })}>
        <option value="">Todos os projetos</option>
        {projects.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select className="sb-select filterbar__select" value={filters.user} onChange={(e) => set({ user: e.target.value })}>
        <option value="">Todos os usuários</option>
        {users.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <select className="sb-select filterbar__select" value={filters.priority} onChange={(e) => set({ priority: e.target.value })}>
        <option value="">Todas as prioridades</option>
        {priorities.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select className="sb-select filterbar__select" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
        <option value="">Todos os estados</option>
        {BOARD_COLUMNS.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
      {hasActiveFilters(filters) && (
        <button type="button" className="filterbar__clear" onClick={() => onChange(EMPTY_FILTERS)}>
          Limpar
        </button>
      )}
    </div>
  );
}

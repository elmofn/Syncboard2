import type { Task } from '../types/api';
import { personEmail, personName } from '../types/api';

export interface Filters {
  search: string;
  project: string;
  user: string;
  priority: string;
  status: string;
}

export const EMPTY_FILTERS: Filters = { search: '', project: '', user: '', priority: '', status: '' };

export function hasActiveFilters(f: Filters): boolean {
  return Boolean(f.search || f.project || f.user || f.priority || f.status);
}

export function filterTasks(tasks: Task[], f: Filters): Task[] {
  const q = f.search.trim().toLowerCase();
  const user = f.user.trim().toLowerCase();
  return tasks.filter((t) => {
    if (q && !`${t.id} ${t.title}`.toLowerCase().includes(q)) return false;
    if (f.project && t.project !== f.project) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (user) {
      const people = Array.isArray(t.responsible) ? t.responsible : [];
      const match = people.some(
        (r) => personName(r).toLowerCase() === user || personEmail(r).toLowerCase() === user,
      );
      if (!match) return false;
    }
    return true;
  });
}

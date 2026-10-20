import type { ApiClient, TaskPatch } from './apiClient';
import type { Task, User, Notification, CreateTaskPayload } from '../types/api';

// Cliente real contra /api/* (ver docs/API.md). A autenticação é via cookie
// do SWA (Google OAuth) — nenhum header de Authorization é necessário.
async function req<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(text || `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  return (ct.includes('application/json') ? await res.json() : (await res.text())) as T;
}

export const liveApi: ApiClient = {
  getTasks: () => req<Task[]>('/api/getTasks'),
  getArchivedTasks: () => req<Task[]>('/api/getArchivedTasks'),
  getUsers: () => req<User[]>(`/api/getUsers?t=${Date.now()}`),
  getNotifications: () => req<Notification[]>('/api/getNotifications', { cache: 'no-store' }),

  createTask: (payload: CreateTaskPayload) =>
    req<Task>('/api/createTask', { method: 'POST', body: JSON.stringify(payload) }),

  updateTask: (id: string, patch: TaskPatch) =>
    req<Task>(`/api/updateTask/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) }),

  deleteTask: (id: string) =>
    req<void>(`/api/deleteTask/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  updateOrder: (items) =>
    req<void>('/api/updateOrder', { method: 'POST', body: JSON.stringify(items) }),

  markNotificationRead: (id: string) =>
    req<void>('/api/markNotificationRead', { method: 'POST', body: JSON.stringify({ id }) }),
};

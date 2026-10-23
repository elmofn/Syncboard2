import type { ApiClient, TaskPatch } from './apiClient';
import type { Task, User, Notification, CreateTaskPayload, ProjectCount, Attachment, UserInput } from '../types/api';

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
  // Faz o parse pelo corpo, não pelo Content-Type: o Azure Functions/SWA nem
  // sempre marca `application/json` em corpos de array, e confiar no header
  // devolvia uma string (quebrava `.filter`/`.map` no front).
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export const liveApi: ApiClient = {
  getTasks: () => req<Task[]>('/api/getTasks'),
  getArchivedTasks: () => req<Task[]>('/api/getArchivedTasks'),
  getUsers: () => req<User[]>(`/api/getUsers?t=${Date.now()}`),
  getNotifications: () => req<Notification[]>('/api/getNotifications', { cache: 'no-store' }),
  getProjectTaskCounts: () => req<ProjectCount[]>('/api/getProjectTaskCounts'),

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

  addComment: (taskId, payload) =>
    req<Task>(`/api/addComment/${encodeURIComponent(taskId)}`, { method: 'POST', body: JSON.stringify(payload) }),

  editComment: (taskId, commentId, text, authorEmail) =>
    req<Task>(`/api/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'PUT',
      body: JSON.stringify({ text, author: authorEmail }),
    }),

  deleteComment: (taskId, index) =>
    req<Task>(`/api/deleteComment/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ index }),
    }),

  signalResponsible: (taskId, targets) =>
    req<Task>(`/api/signalResponsible/${encodeURIComponent(taskId)}`, {
      method: 'POST',
      body: JSON.stringify({ targets }),
    }),

  dismissAlert: (taskId, expectedEtag) =>
    req<Task>(`/api/dismissAlert/${encodeURIComponent(taskId)}`, {
      method: 'POST',
      body: JSON.stringify({ expectedEtag }),
    }),

  improveTitle: (currentTitle, userInstruction) =>
    req<{ title: string }>('/api/improveTitle', {
      method: 'POST',
      body: JSON.stringify({ currentTitle, userInstruction }),
    }),

  async uploadAttachment(file: File) {
    const res = await fetch('/api/tasks/attachments', {
      method: 'POST',
      headers: {
        'x-file-name': encodeURIComponent(file.name),
        'x-file-type': file.type || 'application/octet-stream',
        'Content-Type': 'application/octet-stream',
      },
      body: file,
    });
    if (!res.ok) throw new Error((await res.text()) || 'Falha no upload.');
    return (await res.json()) as Attachment;
  },

  addUser: (payload: UserInput) =>
    req<User>('/api/addUser', { method: 'POST', body: JSON.stringify(payload) }),

  updateUser: (id: string, payload: UserInput) =>
    req<User>(`/api/updateUser/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),

  deleteUser: (id: string) =>
    req<void>(`/api/deleteUser/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

import type { Task, User, Notification, CreateTaskPayload } from '../types/api';

/** Patch genérico de tarefa; aceita os auxiliares de concorrência do contrato. */
export type TaskPatch = Partial<Task> & {
  expectedStatus?: string;
  expectedEtag?: string;
  [key: string]: unknown;
};

export interface ApiClient {
  getTasks(): Promise<Task[]>;
  getArchivedTasks(): Promise<Task[]>;
  getUsers(): Promise<User[]>;
  getNotifications(): Promise<Notification[]>;
  createTask(payload: CreateTaskPayload): Promise<Task>;
  updateTask(id: string, patch: TaskPatch): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  updateOrder(items: { id: string; order: number }[]): Promise<void>;
  markNotificationRead(id: string): Promise<void>;
}

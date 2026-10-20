// Store em memória do modo mock + "bus" que simula o SignalR.
import type { Task, User, Notification } from '../../types/api';
import { mockTasks, mockUsers, mockNotifications } from './fixtures';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export type RealtimeEvent = 'taskCreated' | 'taskUpdated' | 'taskDeleted' | 'tasksReordered';

class MockStore {
  tasks: Task[] = clone(mockTasks);
  users: User[] = clone(mockUsers);
  notifications: Notification[] = clone(mockNotifications);
  bus = new EventTarget();

  emit(type: RealtimeEvent, detail?: unknown) {
    this.bus.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

export const store = new MockStore();

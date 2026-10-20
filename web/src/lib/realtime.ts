import { IS_MOCK } from './config';
import type { Task } from '../types/api';
import { store, type RealtimeEvent } from './mock/store';

export interface RealtimeHandlers {
  taskCreated?(task: Task): void;
  taskUpdated?(task: Task): void;
  taskDeleted?(taskId: string): void;
  tasksReordered?(): void;
}

/** Conecta ao realtime e devolve uma função para desconectar. */
export function connectRealtime(handlers: RealtimeHandlers): () => void {
  if (IS_MOCK) return connectMock(handlers);
  return connectLive(handlers);
}

function connectMock(handlers: RealtimeHandlers): () => void {
  const map: Record<RealtimeEvent, (detail: unknown) => void> = {
    taskCreated: (d) => handlers.taskCreated?.(d as Task),
    taskUpdated: (d) => handlers.taskUpdated?.(d as Task),
    taskDeleted: (d) => handlers.taskDeleted?.(d as string),
    tasksReordered: () => handlers.tasksReordered?.(),
  };
  const listeners: [RealtimeEvent, EventListener][] = [];
  (Object.keys(map) as RealtimeEvent[]).forEach((evt) => {
    const l: EventListener = (e) => map[evt]((e as CustomEvent).detail);
    store.bus.addEventListener(evt, l);
    listeners.push([evt, l]);
  });
  return () => listeners.forEach(([evt, l]) => store.bus.removeEventListener(evt, l));
}

function connectLive(handlers: RealtimeHandlers): () => void {
  let disposed = false;
  let connection: { stop(): void } | null = null;

  (async () => {
    const signalR = await import('@microsoft/signalr');
    if (disposed) return;
    const conn = new signalR.HubConnectionBuilder().withUrl('/api').withAutomaticReconnect().build();
    conn.on('taskCreated', (t: Task) => handlers.taskCreated?.(t));
    conn.on('taskUpdated', (t: Task) => handlers.taskUpdated?.(t));
    conn.on('taskDeleted', (id: string) => handlers.taskDeleted?.(id));
    conn.on('tasksReordered', () => handlers.tasksReordered?.());
    try {
      await conn.start();
    } catch {
      /* o quadro ainda funciona sem realtime; recarregar reconecta */
    }
    connection = conn;
  })();

  return () => {
    disposed = true;
    connection?.stop();
  };
}

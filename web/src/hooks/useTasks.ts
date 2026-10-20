import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task, TaskStatus } from '../types/api';
import { api } from '../lib/api';
import { connectRealtime } from '../lib/realtime';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks ?? [];

  const load = useCallback(async () => {
    try {
      setError(null);
      setTasks(await api.getTasks());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar tarefas.');
    }
  }, []);

  useEffect(() => {
    load();
    const off = connectRealtime({
      taskCreated: (t) =>
        setTasks((prev) => (prev && !prev.some((x) => x.id === t.id) ? [...prev, t] : prev)),
      taskUpdated: (t) =>
        setTasks((prev) => {
          if (!prev) return prev;
          const next = prev.some((x) => x.id === t.id)
            ? prev.map((x) => (x.id === t.id ? t : x))
            : [...prev, t];
          return next.filter((x) => x.status !== 'done');
        }),
      taskDeleted: (id) => setTasks((prev) => prev?.filter((x) => x.id !== id) ?? prev),
      tasksReordered: () => load(),
    });
    return off;
  }, [load]);

  /** Move uma tarefa de coluna (muda o status) com atualização otimista. */
  const moveTask = useCallback(async (id: string, status: TaskStatus) => {
    const current = tasksRef.current.find((t) => t.id === id);
    if (!current || current.status === status) return;
    const prevStatus = current.status;
    setTasks((prev) => prev?.map((t) => (t.id === id ? { ...t, status } : t)) ?? prev);
    try {
      await api.updateTask(id, {
        status,
        expectedStatus: prevStatus,
        expectedEtag: current._etag,
      });
    } catch (e) {
      // desfaz em caso de erro/conflito
      setTasks((prev) => prev?.map((t) => (t.id === id ? { ...t, status: prevStatus } : t)) ?? prev);
      setError(e instanceof Error ? e.message : 'Falha ao mover a tarefa.');
    }
  }, []);

  /** Reordena (e opcionalmente move de coluna) definindo um novo `order`. */
  const reorderTask = useCallback(
    async (id: string, status: TaskStatus, order: number, prevStatus?: TaskStatus, etag?: string) => {
      setTasks((prev) => prev?.map((t) => (t.id === id ? { ...t, status, order } : t)) ?? prev);
      try {
        const patch: Record<string, unknown> = { order };
        if (prevStatus && prevStatus !== status) {
          patch.status = status;
          patch.expectedStatus = prevStatus;
          patch.expectedEtag = etag;
        }
        await api.updateTask(id, patch);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao reordenar.');
        load();
      }
    },
    [load],
  );

  return { tasks, error, moveTask, reorderTask, reload: load };
}

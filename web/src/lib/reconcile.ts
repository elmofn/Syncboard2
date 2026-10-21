import type { Task } from '../types/api';

// Os alertas podem chegar como objeto {targetUser,timestamp,acknowledgedAt} ou,
// em registros legados, como string nua — os helpers abaixo lidam com ambos.
function alertKey(a: unknown): string {
  if (a && typeof a === 'object') return String((a as { targetUser?: string }).targetUser ?? '');
  return String(a ?? '');
}
function alertTime(a: unknown): number {
  const ts = a && typeof a === 'object' ? (a as { timestamp?: string }).timestamp : undefined;
  return (ts ? Date.parse(ts) : 0) || 0;
}
function alertTs(a: unknown): string | null {
  return a && typeof a === 'object' ? (a as { timestamp?: string }).timestamp ?? null : null;
}
function alertAck(a: unknown): string | null {
  return a && typeof a === 'object' ? (a as { acknowledgedAt?: string }).acknowledgedAt ?? null : null;
}

/**
 * TC495: um `taskUpdated` recebido via realtime não pode desfazer uma mudança de
 * estágio já commitada localmente. Ignora o update quando o estágio recebido é
 * mais antigo, ou — empatado — quando um sinal local é mais novo que os
 * recebidos ou o recebimento (`acknowledgedAt`) regrediria (o recebimento é
 * monotônico por sinal). Porta fiel da lógica em `app/js/signalr.js`.
 */
export function shouldIgnoreTaskUpdate(current: Task, incoming: Task): boolean {
  const safeInt = (n: unknown): number => (Number.isSafeInteger(n) ? (n as number) : 0);
  const incomingStage = safeInt(incoming.notificationStageVersion);
  const currentStage = safeInt(current.notificationStageVersion);

  const currentAlerts = Array.isArray(current.pendingAlerts) ? current.pendingAlerts : [];
  const incomingAll = Array.isArray(incoming.pendingAlerts) ? incoming.pendingAlerts : [];

  const newerSignalExists = currentAlerts.some((cur) => {
    const currentTime = alertTime(cur);
    const matched = incomingAll.filter((a) => alertKey(a) === alertKey(cur));
    const incomingTimes = matched.map(alertTime);
    const receiptWouldRegress =
      !!alertAck(cur) && matched.some((a) => alertTs(a) === alertTs(cur) && !alertAck(a));
    return currentTime > Math.max(0, ...incomingTimes) || receiptWouldRegress;
  });

  return incomingStage < currentStage || (incomingStage === currentStage && newerSignalExists);
}

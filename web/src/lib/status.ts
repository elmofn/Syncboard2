import type { TaskStatus } from '../types/api';

export interface StatusMeta {
  key: TaskStatus;
  label: string;
  icon: string;
  /** classe CSS do badge (usa variáveis de status do tema) */
  colorVar: string;
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  todo: { key: 'todo', label: 'Fila', icon: '○', colorVar: 'todo' },
  stopped: { key: 'stopped', label: 'Parado', icon: 'Ⅱ', colorVar: 'stopped' },
  inprogress: { key: 'inprogress', label: 'Andamento', icon: '→', colorVar: 'inprogress' },
  homologation: { key: 'homologation', label: 'Homologação', icon: '◇', colorVar: 'homologation' },
  publication: { key: 'publication', label: 'Publicação', icon: '↗', colorVar: 'publication' },
  done: { key: 'done', label: 'Concluída', icon: '✓', colorVar: 'todo' },
};

/** Colunas do quadro (done = arquivada, fora do board). */
export const BOARD_COLUMNS: TaskStatus[] = [
  'todo',
  'stopped',
  'inprogress',
  'homologation',
  'publication',
];

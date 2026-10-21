import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { ArrowRight, ArrowUpRight, Check, Circle, Diamond, Pause } from '@phosphor-icons/react';
import type { TaskStatus } from '../types/api';

export interface StatusMeta {
  key: TaskStatus;
  label: string;
  icon: ComponentType<IconProps>;
  /** classe CSS do badge (usa variáveis de status do tema) */
  colorVar: string;
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  todo: { key: 'todo', label: 'Fila', icon: Circle, colorVar: 'todo' },
  stopped: { key: 'stopped', label: 'Parado', icon: Pause, colorVar: 'stopped' },
  inprogress: { key: 'inprogress', label: 'Andamento', icon: ArrowRight, colorVar: 'inprogress' },
  homologation: { key: 'homologation', label: 'Homologação', icon: Diamond, colorVar: 'homologation' },
  publication: { key: 'publication', label: 'Publicação', icon: ArrowUpRight, colorVar: 'publication' },
  done: { key: 'done', label: 'Concluída', icon: Check, colorVar: 'todo' },
};

/** Colunas do quadro (done = arquivada, fora do board). */
export const BOARD_COLUMNS: TaskStatus[] = [
  'todo',
  'stopped',
  'inprogress',
  'homologation',
  'publication',
];

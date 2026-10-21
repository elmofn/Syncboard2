import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { CheckCircle, MagnifyingGlass, PauseCircle, Rocket, Spinner, Tray } from '@phosphor-icons/react';
import type { TaskStatus } from '../types/api';

export interface StatusMeta {
  key: TaskStatus;
  label: string;
  icon: ComponentType<IconProps>;
  /** classe CSS do badge (usa variáveis de status do tema) */
  colorVar: string;
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  todo: { key: 'todo', label: 'Fila', icon: Tray, colorVar: 'todo' },
  stopped: { key: 'stopped', label: 'Parado', icon: PauseCircle, colorVar: 'stopped' },
  inprogress: { key: 'inprogress', label: 'Andamento', icon: Spinner, colorVar: 'inprogress' },
  homologation: { key: 'homologation', label: 'Homologação', icon: MagnifyingGlass, colorVar: 'homologation' },
  publication: { key: 'publication', label: 'Publicação', icon: Rocket, colorVar: 'publication' },
  done: { key: 'done', label: 'Concluída', icon: CheckCircle, colorVar: 'todo' },
};

/** Colunas do quadro (done = arquivada, fora do board). */
export const BOARD_COLUMNS: TaskStatus[] = [
  'todo',
  'stopped',
  'inprogress',
  'homologation',
  'publication',
];

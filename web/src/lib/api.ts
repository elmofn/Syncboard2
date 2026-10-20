import { IS_MOCK } from './config';
import type { ApiClient } from './apiClient';
import { mockApi } from './api.mock';
import { liveApi } from './api.live';

// Seleciona a implementação conforme o modo. O resto do app importa só `api`.
export const api: ApiClient = IS_MOCK ? mockApi : liveApi;
export type { ApiClient } from './apiClient';

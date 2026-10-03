import { env } from '@/lib/env';
import type { ApiClient } from './client';
import { httpApi } from './http';
import { mockApi } from './mock/mock-api';

export { ApiError, type ApiClient } from './client';

export const api: ApiClient = env.apiMode === 'http' ? httpApi : mockApi;

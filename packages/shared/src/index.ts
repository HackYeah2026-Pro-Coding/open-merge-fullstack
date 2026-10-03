/**
 * Types and helpers shared by the API and the web app.
 *
 * The web app imports types only: this package compiles to CommonJS, which the
 * browser bundle does not consume. Keep runtime values out of what the web needs.
 */

export interface HealthResponse {
  status: 'ok';
  database: 'up';
  uptimeSeconds: number;
}

export const API_PREFIX = '/api';

export * from './money';
export * from './user';
export * from './project';
export * from './bounty';

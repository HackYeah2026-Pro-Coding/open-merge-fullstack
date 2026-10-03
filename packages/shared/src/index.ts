/**
 * Types and helpers shared by the API and the web app.
 * Business types (bounties, submissions, reviews) go here later so that one
 * definition serves both sides.
 */

export interface HealthResponse {
  status: 'ok';
  database: 'up';
  uptimeSeconds: number;
}

export const API_PREFIX = '/api';

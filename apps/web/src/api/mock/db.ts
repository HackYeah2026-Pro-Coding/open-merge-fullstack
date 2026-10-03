import { seedDatabase } from './seed';
import type { MockDb } from './types';

/**
 * In-browser stand-in for the database, the GitHub webhooks and the escrow
 * program. Persisted to localStorage so a demo survives a reload.
 */

const STORAGE_KEY = 'openmerge.mock.v1';

let db: MockDb | null = null;
let persistence = true;

function load(): MockDb {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    // Storage is blocked; the mock keeps working in memory for this tab.
    persistence = false;
    console.warn('[mock] localStorage unavailable, mock data will not persist', error);
  }
  if (raw) {
    const parsed = JSON.parse(raw) as MockDb;
    if (parsed.version === 5) return parsed;
  }
  return seedDatabase(new Date());
}

export function getDb(): MockDb {
  db ??= load();
  return db;
}

export function saveDb(): void {
  if (!db || !persistence) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function resetDb(): void {
  db = seedDatabase(new Date());
  saveDb();
}

export function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 220 + Math.random() * 380));
}

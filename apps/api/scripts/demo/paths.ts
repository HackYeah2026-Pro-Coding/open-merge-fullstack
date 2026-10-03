import * as path from 'node:path';

/** Repository root, where .env and demo/ live. */
export const ROOT = path.resolve(__dirname, '../../../..');
export const DEMO_DIR = path.join(ROOT, 'demo');
/** Escrows a reset left locked: nothing in the API can refund them yet, so they are recorded here. */
export const ORPHANED_ESCROWS_FILE = path.join(DEMO_DIR, '.orphaned-escrows.json');

#!/usr/bin/env node
/**
 * Reads or sets DB_TARGET in the root .env.
 *   node scripts/db-target.mjs            -> prints the current target
 *   node scripts/db-target.mjs supabase   -> switches to supabase
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const TARGETS = ['local', 'supabase'];
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');

if (!existsSync(envPath)) {
  console.error('No .env at the repository root. Run: cp .env.example .env');
  process.exit(1);
}

const contents = readFileSync(envPath, 'utf8');
const current = /^DB_TARGET=(.*)$/m.exec(contents)?.[1]?.trim() ?? 'local';
const requested = process.argv[2];

if (!requested) {
  console.log(current);
  process.exit(0);
}

if (!TARGETS.includes(requested)) {
  console.error(`Unknown target "${requested}". Use one of: ${TARGETS.join(', ')}`);
  process.exit(1);
}

const next = /^DB_TARGET=.*$/m.test(contents)
  ? contents.replace(/^DB_TARGET=.*$/m, `DB_TARGET=${requested}`)
  : `DB_TARGET=${requested}\n${contents}`;

writeFileSync(envPath, next);
console.log(`DB_TARGET: ${current} -> ${requested}`);

const supabaseUrl = /^SUPABASE_DATABASE_URL=(.*)$/m.exec(contents)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
if (requested === 'supabase' && supabaseUrl === '') {
  console.warn('\nSUPABASE_DATABASE_URL is still empty — set it in .env before running anything.');
}

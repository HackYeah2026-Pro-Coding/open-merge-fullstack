#!/usr/bin/env node
/**
 * Starts the local Postgres container, but only when DB_TARGET=local.
 * Pointing at Supabase means there is nothing to start, so `pnpm dev` should
 * not fail on a missing or unreachable Docker daemon.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const target = existsSync(envPath)
  ? (/^DB_TARGET=(.*)$/m.exec(readFileSync(envPath, 'utf8'))?.[1]?.trim() ?? 'local')
  : 'local';

if (target !== 'local') {
  console.log(`DB_TARGET=${target} — no local container needed.`);
  process.exit(0);
}

const result = spawnSync('docker', ['compose', 'up', '-d', '--wait', 'postgres'], {
  cwd: root,
  stdio: 'inherit',
});

if (result.error?.code === 'ENOENT') {
  console.error('\nDocker is not installed or not on PATH.');
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    '\nCould not start Postgres. If this says "permission denied ... docker.sock",\n' +
      'your shell session predates your docker group membership. Run `newgrp docker`\n' +
      'or open a new terminal. Alternatively switch to Supabase: pnpm use:supabase',
  );
  process.exit(result.status ?? 1);
}

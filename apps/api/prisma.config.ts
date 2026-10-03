import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';
import { describeDbTarget, resolveMigrationUrl } from './src/config/database-url';

// The monorepo keeps a single .env at the root. Prisma 7 no longer loads .env
// automatically, and CLI commands run with cwd=apps/api, so resolve it explicitly.
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

// Loud on purpose: migrations are destructive, so never guess which database.
console.log(`[prisma] target: ${describeDbTarget()}`);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: resolveMigrationUrl(),
  },
});

import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { describeDbTarget, resolveDatabaseUrl } from '../src/config/database-url';

dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

console.log(`[seed] target: ${describeDbTarget()}`);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: resolveDatabaseUrl() }),
});

/** Idempotent: upserts on a natural key, so re-running converges instead of duplicating. */
async function main(): Promise<void> {
  await prisma.githubAccount.upsert({
    where: { githubId: 1001 },
    update: {},
    create: {
      githubId: 1001,
      githubLogin: 'octocat',
      name: 'The Octocat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
    },
  });

  console.log(`Seed complete: ${await prisma.githubAccount.count()} account(s)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    // Crash with the full stack — a half-seeded database must not look like success.
    throw error;
  });

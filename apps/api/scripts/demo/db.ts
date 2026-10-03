import { PrismaPg } from '@prisma/adapter-pg';
import { describeDbTarget, resolveDatabaseUrl } from '../../src/config/database-url';
import { PrismaClient } from '../../src/generated/prisma/client';

export { describeDbTarget };

/** Same driver adapter setup as prisma/seed.ts: whichever database .env selects. */
export function connectDb(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: resolveDatabaseUrl() }) });
}

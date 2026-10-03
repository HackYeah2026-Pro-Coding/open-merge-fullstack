import * as fs from 'node:fs';
import { z } from 'zod';

const orphanSchema = z.object({
  escrowAddress: z.string(),
  rewardBaseUnits: z.string(),
  repo: z.string(),
  issueNumber: z.number().int().nullable(),
  recordedAt: z.string(),
});
export type OrphanedEscrow = z.infer<typeof orphanSchema>;

/**
 * Appends escrows whose bounty rows a reset deleted before they were released. The tokens are still
 * locked on chain and the database no longer says where; the escrow program can cancel them.
 */
export function recordOrphanedEscrows(file: string, entries: OrphanedEscrow[]): void {
  const known = fs.existsSync(file) ? z.array(orphanSchema).parse(JSON.parse(fs.readFileSync(file, 'utf8'))) : [];
  const seen = new Set(known.map((entry) => entry.escrowAddress));
  const added = entries.filter((entry) => !seen.has(entry.escrowAddress));
  fs.writeFileSync(file, `${JSON.stringify([...known, ...added], null, 2)}\n`);
}

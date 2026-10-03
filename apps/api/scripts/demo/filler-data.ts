import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { DEMO_DIR } from './paths';

export const FILLER_STATES = ['open', 'in_review', 'in_review_split', 'payout_held', 'paid', 'closed'] as const;
export type FillerState = (typeof FILLER_STATES)[number];

const text = z.string().trim().min(1);

const fillerSchema = z.object({
  /** Developers who "solved" the bounties. They are database rows only, never real GitHub accounts. */
  authors: z.array(z.object({ login: text, name: text, githubId: z.number().int().positive(), wallet: z.boolean() })),
  repos: z.array(z.object({ name: text, description: text })),
  bounties: z.array(
    z.object({
      repo: text,
      title: z.string().trim().min(8).max(256),
      problem: text,
      expected: text,
      criteria: z.array(text).min(1),
      /** Whole tokens. */
      reward: z.number().int().positive(),
      labels: z.array(text).max(10),
      state: z.enum(FILLER_STATES),
      /** Required for every state but "open". */
      author: text.optional(),
      /** How long ago the bounty was created; later events are spread over this span. */
      ageDays: z.number().min(0.25),
    }),
  ),
});

export type FillerData = z.infer<typeof fillerSchema>;
export type FillerBounty = FillerData['bounties'][number];
export type FillerAuthor = FillerData['authors'][number];

/** Everything the schema cannot say: references must resolve, and a state must fit its author's wallet. */
export function validateFiller(data: FillerData): string[] {
  const problems: string[] = [];
  const repos = new Set(data.repos.map((r) => r.name));
  const authors = new Map(data.authors.map((a) => [a.login, a]));
  const seen = new Set<string>();

  for (const b of data.bounties) {
    const label = `${b.repo}: "${b.title}"`;
    if (!repos.has(b.repo)) problems.push(`${label} uses an unknown repo`);
    if (seen.has(`${b.repo}/${b.title}`)) problems.push(`${label} is listed twice`);
    seen.add(`${b.repo}/${b.title}`);

    if (b.state === 'open') continue;
    const author = b.author ? authors.get(b.author) : undefined;
    if (!author) problems.push(`${label} needs an author from "authors"`);
    else if (b.state === 'paid' && !author.wallet) problems.push(`${label} is paid, so ${author.login} needs a wallet`);
    else if (b.state === 'payout_held' && author.wallet) problems.push(`${label} is held, so ${author.login} must not have a wallet`);
  }
  if (new Set(data.authors.map((a) => a.githubId)).size !== data.authors.length) problems.push('authors share a githubId');
  return problems;
}

export function loadFiller(dir: string = DEMO_DIR): FillerData {
  const data = fillerSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, 'filler.json'), 'utf8')));
  const problems = validateFiller(data);
  if (problems.length > 0) throw new Error(`demo/filler.json is inconsistent:\n  ${problems.join('\n  ')}`);
  return data;
}

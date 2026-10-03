import { z } from 'zod';

/** The part of GitHub's `pull_request` webhook payload the review uses. */
export const pullRequestEventSchema = z.object({
  action: z.string(),
  pull_request: z.object({
    number: z.number().int(),
    title: z.string(),
    html_url: z.string(),
    draft: z.boolean().optional(),
    merged: z.boolean().optional(),
    user: z.object({ login: z.string(), avatar_url: z.string().nullable().optional() }),
    head: z.object({ sha: z.string() }),
  }),
  repository: z.object({ full_name: z.string() }),
});

export type PullRequestEvent = z.infer<typeof pullRequestEventSchema>;

/** Actions that put a new or changed head commit in front of the reviewers. */
export const REVIEW_ACTIONS = new Set(['opened', 'synchronize', 'reopened', 'ready_for_review']);

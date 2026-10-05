import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { z } from 'zod';
import { UsageError } from './errors';
import { ROOT } from './paths';

/** An empty value in .env means "not set". */
const text = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const envSchema = z.object({
  GITHUB_ORG: z.string().trim().min(1).default('HackYeah2026-Pro-Coding'),
  GITHUB_TOKEN: text,
  DEMO_ADMIN_TOKEN: text,
  DEMO_DEV_TOKEN: text,
  DEMO_API_URL: text,
  API_URL: text,
  WEB_ORIGIN: text,
  CLAUDE_REVIEW_MODEL: text,
  GEMINI_MODEL: text,
});

/** Which token plays which part; the values are the variable names in .env. */
export const TOKEN_VARS = {
  /** The bot the API itself uses: opens issues, sets commit statuses. */
  bot: 'GITHUB_TOKEN',
  /** An organization admin: creates repos, force-resets main, merges. */
  admin: 'DEMO_ADMIN_TOKEN',
  /** The demo developer: opens pull requests and pushes the fix. */
  dev: 'DEMO_DEV_TOKEN',
} as const;
export type TokenRole = keyof typeof TOKEN_VARS;

export interface DemoEnv {
  org: string;
  /** Base URL of the running API, without a trailing slash. */
  apiUrl: string;
  /** Base URL of the web app, for links the demo prints. */
  webUrl: string;
  tokens: Partial<Record<TokenRole, string>>;
  models: { claude: string; gemini: string };
}

export function loadDotenv(): void {
  dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
}

export function loadDemoEnv(raw: NodeJS.ProcessEnv = process.env): DemoEnv {
  const env = envSchema.parse(raw);
  return {
    org: env.GITHUB_ORG,
    apiUrl: (env.DEMO_API_URL ?? env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
    webUrl: (env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, ''),
    tokens: { bot: env.GITHUB_TOKEN, admin: env.DEMO_ADMIN_TOKEN, dev: env.DEMO_DEV_TOKEN },
    models: { claude: env.CLAUDE_REVIEW_MODEL ?? 'claude-opus-5-5', gemini: env.GEMINI_MODEL ?? 'gemini-pro' },
  };
}

export function requireToken(env: DemoEnv, role: TokenRole): string {
  const token = env.tokens[role];
  if (!token) throw new UsageError(`${TOKEN_VARS[role]} is not set in .env. See demo/README.md for the tokens the demo needs.`);
  return token;
}

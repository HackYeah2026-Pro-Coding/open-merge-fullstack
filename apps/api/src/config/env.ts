import { z } from 'zod';
import { DB_TARGETS, resolveDatabaseUrl } from './database-url';
import { escrowEnvIssue } from './escrow-env';

/**
 * Validated once at boot, so a missing variable is a clear startup error instead
 * of an undefined crashing somewhere later. Add keys here as features land.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  // Public base URL of this API, used to build absolute links such as the token
  // image URL. In production it must be reachable from outside.
  API_URL: z.string().url().default('http://localhost:3000'),

  // Signing secrets. Required in production; development falls back to fixed values.
  WALLET_CHALLENGE_SECRET: z.string().min(32).or(z.literal('')).optional(),
  SESSION_SECRET: z.string().min(32).or(z.literal('')).optional(),

  // GitHub OAuth App for developer sign-in. Required in production; in development
  // the API still boots without them and sign-in answers 503 until they are set.
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Which database to talk to. The URLs live side by side so switching is a
  // one-word edit, never a connection-string edit. See src/config/database-url.ts.
  DB_TARGET: z.enum(DB_TARGETS).default('local'),
  LOCAL_DATABASE_URL: z.string().optional(),
  SUPABASE_DATABASE_URL: z.string().optional(),
  SUPABASE_DIRECT_URL: z.string().optional(),

  // Optional GitHub token for REST API calls. Without it requests are anonymous:
  // public repos only, 60 requests an hour.
  GITHUB_TOKEN: z.string().optional(),

  // Solana escrow, off until SERVER_WALLET_KEYPAIR_B64 is set (POST /issue answers
  // 503 meanwhile). The values are cross-checked in src/config/escrow-env.ts.
  SOLANA_RPC_URL: z.string().url().default('https://api.devnet.solana.com'),
  ESCROW_PROGRAM_ID: z.string().trim().optional(),
  TOKEN_MINT: z.string().trim().optional(),
  SOLANA_CI_KEYPAIR_B64: z.string().trim().optional(),
  SERVER_WALLET_KEYPAIR_B64: z.string().trim().optional(),
  SERVER_WALLET_ADDRESS: z.string().trim().optional(),

  // AI review of pull requests. Optional in development: without them the review
  // webhook answers 503 naming what is missing. Required in production.
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_REVIEW_MODEL: z.string().min(1).default('claude-opus-5-5'),
  GEMINI_API_KEY: z.string().optional(),
  // Taken from Google AI Studio; model names change more often than this code.
  GEMINI_MODEL: z.string().optional(),
});

/** Variables the AI review cannot run without; each must be set in production. */
const REVIEW_REQUIRED = [
  'GITHUB_WEBHOOK_SECRET',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
] as const;

type Resolved =
  | 'WALLET_CHALLENGE_SECRET'
  | 'SESSION_SECRET'
  | 'GITHUB_CLIENT_ID'
  | 'GITHUB_CLIENT_SECRET';

/** DATABASE_URL is derived from DB_TARGET rather than set directly. */
export type Env = Omit<z.infer<typeof envSchema>, Resolved> & {
  DATABASE_URL: string;
  WALLET_CHALLENGE_SECRET: string;
  SESSION_SECRET: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

function configError(issue: string): Error {
  return new Error(
    `Invalid environment configuration:\n  ${issue}\n\nSee .env.example.`,
  );
}

/** A signing secret, or a fixed development-only value outside production. */
function secretOrFallback(
  name: string,
  value: string | undefined,
  production: boolean,
): string {
  if (value) return value;
  if (production)
    throw configError(`${name}: required in production (min 32 chars)`);
  return `development-only-${name.toLowerCase().replaceAll('_', '-')}`;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nSee .env.example.`,
    );
  }

  // Throws with an actionable message naming the variable that is missing.
  const DATABASE_URL = resolveDatabaseUrl(
    raw as Record<string, string | undefined>,
  );
  const {
    WALLET_CHALLENGE_SECRET,
    SESSION_SECRET,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    ...rest
  } = result.data;
  const production = rest.NODE_ENV === 'production';

  const clientId = GITHUB_CLIENT_ID?.trim() || undefined;
  const clientSecret = GITHUB_CLIENT_SECRET?.trim() || undefined;
  if (!clientId !== !clientSecret) {
    throw configError(
      'GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET: set both or neither',
    );
  }
  if (production && !clientId) {
    throw configError(
      'GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET: required in production',
    );
  }

  const escrowIssue = escrowEnvIssue(rest, production);
  if (escrowIssue) throw configError(escrowIssue);

  if (production) {
    const missing = REVIEW_REQUIRED.filter((name) => !rest[name]?.trim());
    if (missing.length > 0)
      throw configError(`${missing.join(', ')}: required in production`);
  }

  return {
    ...rest,
    DATABASE_URL,
    WALLET_CHALLENGE_SECRET: secretOrFallback(
      'WALLET_CHALLENGE_SECRET',
      WALLET_CHALLENGE_SECRET,
      production,
    ),
    SESSION_SECRET: secretOrFallback(
      'SESSION_SECRET',
      SESSION_SECRET,
      production,
    ),
    GITHUB_CLIENT_ID: clientId,
    GITHUB_CLIENT_SECRET: clientSecret,
  };
}

import { z } from 'zod';
import { DB_TARGETS, resolveDatabaseUrl } from './database-url';

/**
 * Validated once at boot, so a missing variable is a clear startup error instead
 * of an undefined crashing somewhere later. Add keys here as features land.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  // Public base URL of this API, used to build absolute links such as the token
  // image URL. In production it must be reachable from outside.
  API_URL: z.string().url().default('http://localhost:3000'),

  // Signs wallet-link challenges. Required in production; development falls back to a fixed value.
  WALLET_CHALLENGE_SECRET: z.string().min(32).or(z.literal('')).optional(),

  // Which database to talk to. The URLs live side by side so switching is a
  // one-word edit, never a connection-string edit. See src/config/database-url.ts.
  DB_TARGET: z.enum(DB_TARGETS).default('local'),
  LOCAL_DATABASE_URL: z.string().optional(),
  SUPABASE_DATABASE_URL: z.string().optional(),
  SUPABASE_DIRECT_URL: z.string().optional(),

  // Optional GitHub token for REST API calls. Without it requests are anonymous:
  // public repos only, 60 requests an hour.
  GITHUB_TOKEN: z.string().optional(),
});

/** DATABASE_URL is derived from DB_TARGET rather than set directly. */
export type Env = Omit<z.infer<typeof envSchema>, 'WALLET_CHALLENGE_SECRET'> & {
  DATABASE_URL: string;
  WALLET_CHALLENGE_SECRET: string;
};

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`);
  }

  // Throws with an actionable message naming the variable that is missing.
  const DATABASE_URL = resolveDatabaseUrl(raw as Record<string, string | undefined>);
  const { WALLET_CHALLENGE_SECRET: secret, ...rest } = result.data;
  const WALLET_CHALLENGE_SECRET = secret || undefined;
  if (!WALLET_CHALLENGE_SECRET && rest.NODE_ENV === 'production') {
    throw new Error('Invalid environment configuration:\n  WALLET_CHALLENGE_SECRET: required in production (min 32 chars)\n\nSee .env.example.');
  }
  return {
    ...rest,
    DATABASE_URL,
    WALLET_CHALLENGE_SECRET: WALLET_CHALLENGE_SECRET ?? 'development-only-wallet-challenge-secret',
  };
}

/**
 * Resolves which database the app and the Prisma CLI talk to.
 *
 * In development, DB_TARGET in the root .env picks one of two URLs that live
 * side by side, so switching never means editing a connection string and never
 * risks pointing a migration at the wrong database:
 *   DB_TARGET=local     -> the Postgres container from docker-compose.yml
 *   DB_TARGET=supabase  -> the hosted Supabase project
 *
 * In production, hosting platforms inject a single DATABASE_URL. When that is
 * set it wins outright and DB_TARGET is ignored, so a deployed container needs
 * exactly one environment variable.
 */
export const DB_TARGETS = ['local', 'supabase'] as const;
export type DbTarget = (typeof DB_TARGETS)[number];

type EnvLike = Record<string, string | undefined>;

export function resolveDbTarget(env: EnvLike = process.env): DbTarget {
  const raw = (env.DB_TARGET ?? 'local').trim();
  if (!DB_TARGETS.includes(raw as DbTarget)) {
    throw new Error(`DB_TARGET must be one of ${DB_TARGETS.join(' | ')}, got "${raw}"`);
  }
  return raw as DbTarget;
}

function require_(env: EnvLike, key: string, target: DbTarget): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(
      `DB_TARGET=${target} needs ${key} to be set in .env. See .env.example.`,
    );
  }
  return value;
}

/** The URL the running application connects with. */
export function resolveDatabaseUrl(env: EnvLike = process.env): string {
  const explicit = env.DATABASE_URL?.trim();
  if (explicit) return explicit;

  const target = resolveDbTarget(env);
  return target === 'local'
    ? require_(env, 'LOCAL_DATABASE_URL', target)
    : require_(env, 'SUPABASE_DATABASE_URL', target);
}

/**
 * The URL the Prisma CLI uses for migrate / studio / db pull.
 *
 * Supabase's transaction pooler (port 6543) cannot run migrations, so a separate
 * direct or session-mode URL can be supplied. When SUPABASE_DIRECT_URL is unset
 * the application URL is reused, which is correct when it already points at the
 * session pooler (port 5432).
 */
export function resolveMigrationUrl(env: EnvLike = process.env): string {
  const explicit = env.DATABASE_URL?.trim();
  if (explicit) return explicit;

  const target = resolveDbTarget(env);
  if (target === 'local') return resolveDatabaseUrl(env);
  return env.SUPABASE_DIRECT_URL?.trim() || resolveDatabaseUrl(env);
}

/** Host shown in logs so it is obvious which database is in use. Never includes credentials. */
export function describeDbTarget(env: EnvLike = process.env): string {
  const label = env.DATABASE_URL?.trim() ? 'DATABASE_URL' : resolveDbTarget(env);
  try {
    const { hostname, port } = new URL(resolveDatabaseUrl(env));
    return `${label} (${hostname}:${port || '5432'})`;
  } catch {
    return label;
  }
}

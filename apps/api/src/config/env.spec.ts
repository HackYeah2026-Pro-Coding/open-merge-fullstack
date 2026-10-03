import { validateEnv } from './env';

const BASE = { LOCAL_DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };
const PRODUCTION = {
  ...BASE,
  NODE_ENV: 'production',
  WALLET_CHALLENGE_SECRET: 'w'.repeat(32),
  SESSION_SECRET: 's'.repeat(32),
  GITHUB_CLIENT_ID: 'id',
  GITHUB_CLIENT_SECRET: 'secret',
  GITHUB_WEBHOOK_SECRET: 'hook',
  ANTHROPIC_API_KEY: 'anthropic-key',
  GEMINI_API_KEY: 'gemini-key',
  GEMINI_MODEL: 'gemini-model',
};

describe('validateEnv', () => {
  it('boots in development without an OAuth App or secrets', () => {
    const env = validateEnv({ ...BASE, GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: '', SESSION_SECRET: '' });
    expect(env.GITHUB_CLIENT_ID).toBeUndefined();
    expect(env.GITHUB_CLIENT_SECRET).toBeUndefined();
    expect(env.SESSION_SECRET).toBe('development-only-session-secret');
    expect(env.WALLET_CHALLENGE_SECRET).toBe('development-only-wallet-challenge-secret');
  });

  it('accepts a complete production configuration', () => {
    expect(validateEnv(PRODUCTION)).toMatchObject({ SESSION_SECRET: 's'.repeat(32), GITHUB_CLIENT_ID: 'id' });
  });

  it('wants both OAuth values or neither', () => {
    expect(() => validateEnv({ ...BASE, GITHUB_CLIENT_ID: 'id' })).toThrow('set both or neither');
  });

  it('requires the OAuth App in production', () => {
    expect(() => validateEnv({ ...PRODUCTION, GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: '' })).toThrow(
      'GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET: required in production',
    );
  });

  it('requires the AI review configuration in production', () => {
    expect(() => validateEnv({ ...PRODUCTION, GEMINI_API_KEY: '', GITHUB_WEBHOOK_SECRET: ' ' })).toThrow(
      'GITHUB_WEBHOOK_SECRET, GEMINI_API_KEY: required in production',
    );
  });

  it('boots in development without the AI review configuration and defaults the Claude model', () => {
    const env = validateEnv(BASE);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.CLAUDE_REVIEW_MODEL).toBe('claude-opus-5-5');
  });

  it('requires SESSION_SECRET in production', () => {
    expect(() => validateEnv({ ...PRODUCTION, SESSION_SECRET: '' })).toThrow('SESSION_SECRET: required in production');
  });

  it('rejects a short SESSION_SECRET', () => {
    expect(() => validateEnv({ ...BASE, SESSION_SECRET: 'short' })).toThrow('SESSION_SECRET');
  });
});

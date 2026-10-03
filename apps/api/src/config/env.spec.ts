import { Keypair } from '@solana/web3.js';
import { validateEnv } from './env';

const BASE = { LOCAL_DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

const toB64 = (keypair: Keypair) => Buffer.from(JSON.stringify(Array.from(keypair.secretKey))).toString('base64');
const server = Keypair.generate();
const verifier = Keypair.generate();
const ESCROW = {
  ESCROW_PROGRAM_ID: '9MN1vjVWQpePTmrY7nzMBu5ZeGDtQtCbQvWamJWTDMV3',
  TOKEN_MINT: '9tBiUuzd6E3JAwKcdPW26CicHYvcPKvazVvRJjEZPQa9',
  SOLANA_CI_KEYPAIR_B64: toB64(verifier),
  SERVER_WALLET_KEYPAIR_B64: toB64(server),
  SERVER_WALLET_ADDRESS: server.publicKey.toBase58(),
};

const PRODUCTION = {
  ...BASE,
  ...ESCROW,
  NODE_ENV: 'production',
  WALLET_CHALLENGE_SECRET: 'w'.repeat(32),
  SESSION_SECRET: 's'.repeat(32),
  GITHUB_CLIENT_ID: 'id',
  GITHUB_CLIENT_SECRET: 'secret',
  GITHUB_WEBHOOK_SECRET: 'hook',
  ANTHROPIC_API_KEY: 'anthropic-key',
  GEMINI_API_KEY: 'gemini-key',
  GEMINI_MODEL: 'gemini-model',
  GITHUB_OWNER_LOGIN: 'owner',
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

  it('requires the owner login in production', () => {
    expect(() => validateEnv({ ...PRODUCTION, GITHUB_OWNER_LOGIN: '' })).toThrow(
      'GITHUB_OWNER_LOGIN: required in production',
    );
  });

  it('falls back to the organization as owner in development', () => {
    const env = validateEnv({ ...BASE, GITHUB_ORG: 'acme' });
    expect(env.GITHUB_ORG).toBe('acme');
    expect(env.GITHUB_OWNER_LOGIN).toBe('acme');
  });

  it('requires SESSION_SECRET in production', () => {
    expect(() => validateEnv({ ...PRODUCTION, SESSION_SECRET: '' })).toThrow('SESSION_SECRET: required in production');
  });

  it('rejects a short SESSION_SECRET', () => {
    expect(() => validateEnv({ ...BASE, SESSION_SECRET: 'short' })).toThrow('SESSION_SECRET');
  });

  describe('escrow', () => {
    it('stays off in development without a server wallet', () => {
      expect(validateEnv(BASE).SERVER_WALLET_KEYPAIR_B64).toBeUndefined();
    });

    it('accepts a complete configuration', () => {
      expect(validateEnv({ ...BASE, ...ESCROW })).toMatchObject(ESCROW);
    });

    it('requires the server wallet in production', () => {
      expect(() => validateEnv({ ...PRODUCTION, SERVER_WALLET_KEYPAIR_B64: '' })).toThrow(
        'SERVER_WALLET_KEYPAIR_B64: required in production',
      );
    });

    it('requires the other variables once the server wallet is set', () => {
      expect(() => validateEnv({ ...BASE, ...ESCROW, TOKEN_MINT: '', SOLANA_CI_KEYPAIR_B64: '' })).toThrow(
        'TOKEN_MINT, SOLANA_CI_KEYPAIR_B64: required when SERVER_WALLET_KEYPAIR_B64 is set',
      );
    });

    it('rejects a server wallet that does not match SERVER_WALLET_ADDRESS', () => {
      const other = Keypair.generate().publicKey.toBase58();
      expect(() => validateEnv({ ...BASE, ...ESCROW, SERVER_WALLET_ADDRESS: other })).toThrow(
        'is not SERVER_WALLET_ADDRESS',
      );
    });

    it('rejects the same wallet as server and verifier', () => {
      expect(() => validateEnv({ ...BASE, ...ESCROW, SOLANA_CI_KEYPAIR_B64: ESCROW.SERVER_WALLET_KEYPAIR_B64 })).toThrow(
        'must be different wallets',
      );
    });

    it('rejects a program id other than the bundled IDL', () => {
      const other = Keypair.generate().publicKey.toBase58();
      expect(() => validateEnv({ ...BASE, ...ESCROW, ESCROW_PROGRAM_ID: other })).toThrow('differs from the bundled IDL');
    });

    it('rejects an invalid mint address', () => {
      expect(() => validateEnv({ ...BASE, ...ESCROW, TOKEN_MINT: 'XXX' })).toThrow('TOKEN_MINT: not a valid Solana address');
    });

    it('rejects a malformed keypair without echoing it', () => {
      const run = () => validateEnv({ ...BASE, ...ESCROW, SERVER_WALLET_KEYPAIR_B64: 'c2VjcmV0LXZhbHVl' });
      expect(run).toThrow('SERVER_WALLET_KEYPAIR_B64: not base64 of a solana-keygen JSON file');
      expect(run).not.toThrow('secret-value');
    });

    it('rejects a keypair whose public half does not belong to its secret half', () => {
      const tampered = Array.from(server.secretKey);
      tampered.splice(32, 32, ...Array.from(verifier.publicKey.toBytes()));
      const value = Buffer.from(JSON.stringify(tampered)).toString('base64');
      expect(() => validateEnv({ ...BASE, ...ESCROW, SERVER_WALLET_KEYPAIR_B64: value })).toThrow(
        'the public key does not match the secret key',
      );
    });
  });
});

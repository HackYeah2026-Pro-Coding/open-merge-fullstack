import { BadGatewayException, BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import type { EscrowAccount, EscrowReader, TransactionOutcome } from '../escrow-reader.service';
import type { EscrowService } from '../escrow.service';
import { EscrowRoundtripService } from './escrow-roundtrip.service';
import { explorerUrl, formatUnits } from './report';

const ADDRESSES = {
  programId: '9MN1vjVWQpePTmrY7nzMBu5ZeGDtQtCbQvWamJWTDMV3',
  client: 'BKMDuMMxbMzEw8cCSoxHkPWqpA8f29gHiCjn44Q3v9AN',
  verifier: '2UrSbhR1UhCrLTrxH5ZLAU8ytGWKg7EbVgFzAfkqQyT9',
  tokenMint: '9tBiUuzd6E3JAwKcdPW26CicHYvcPKvazVvRJjEZPQa9',
};
const DEVELOPER = 'CterLZRsD29XFT8hayBU36vJAdiCTUjbpw8vabKgK5JH';
const ESCROW = 'EscrowAddress1111111111111111111111111111111';
const VAULT = 'VaultAddress11111111111111111111111111111111';
const DECIMALS = 6;
const TWENTY = 20_000_000n;

/** A tiny in-memory chain that the fake EscrowService writes and the fake reader reads. */
function setup(serverTokens = 1_000_000_000n) {
  const tokens = new Map<string, bigint>([[ADDRESSES.client, serverTokens]]);
  const escrows = new Map<string, EscrowAccount>();
  const move = (from: string, to: string, amount: bigint) => {
    tokens.set(from, (tokens.get(from) ?? 0n) - amount);
    tokens.set(to, (tokens.get(to) ?? 0n) + amount);
  };

  const escrow = {
    addresses: jest.fn(() => ADDRESSES),
    lockReward: jest.fn(async (amount: bigint) => {
      move(ADDRESSES.client, VAULT, amount);
      escrows.set(ESCROW, {
        client: ADDRESSES.client,
        developer: null,
        verifier: ADDRESSES.verifier,
        tokenMint: ADDRESSES.tokenMint,
        amount,
        status: 'funded',
      });
      return { escrowAddress: ESCROW, signature: 'sig_lock' };
    }),
    release: jest.fn(async (address: string, developer: string) => {
      const account = escrows.get(address)!;
      move(VAULT, developer, account.amount);
      escrows.set(address, { ...account, status: 'released', developer });
      return 'sig_release';
    }),
  };
  const reader = {
    mintInfo: jest.fn(async () => ({ decimals: DECIMALS, tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' })),
    programDeployed: jest.fn(async () => true),
    solBalance: jest.fn(async () => 1_000_000_000),
    tokenBalance: jest.fn(async (owner: string) => tokens.get(owner) ?? 0n),
    tokenAccountBalance: jest.fn(async (account: string) => tokens.get(account) ?? 0n),
    vaultAddress: jest.fn(() => VAULT),
    fetchEscrow: jest.fn(async (address: string) => escrows.get(address) ?? null),
    transactionOutcome: jest.fn(async (): Promise<TransactionOutcome> => ({ confirmation: 'confirmed', error: null })),
  };
  const config = { get: () => 'https://api.devnet.solana.com' } as unknown as ConfigService<Env, true>;
  const service = new EscrowRoundtripService(
    config,
    escrow as unknown as EscrowService,
    reader as unknown as EscrowReader,
  );
  service.retryDelayMs = 0;
  return { service, escrow, reader, tokens };
}

const failed = (report: { steps: { checks: { name: string; pass: boolean }[] }[] }) =>
  report.steps.flatMap((s) => s.checks.filter((c) => !c.pass).map((c) => c.name));

describe('EscrowRoundtripService.roundtrip', () => {
  it('locks 20 tokens, releases them to the developer and verifies each step', async () => {
    const { service, escrow, tokens } = setup();

    const report = await service.roundtrip({ developerWallet: DEVELOPER, defaultTokens: 20n });

    expect(failed(report)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.amount).toEqual({ baseUnits: '20000000', display: '20' });
    expect(report.steps.map((s) => [s.step, s.ok])).toEqual([
      ['preflight', true],
      ['create_and_deposit', true],
      ['release', true],
    ]);
    expect(report.steps[1].signature).toBe('sig_lock');
    expect(report.steps[2].explorerUrl).toBe('https://explorer.solana.com/tx/sig_release?cluster=devnet');
    expect(report).toMatchObject({ escrowAddress: ESCROW, vaultAddress: VAULT });
    expect(escrow.lockReward).toHaveBeenCalledWith(TWENTY);
    expect(escrow.release).toHaveBeenCalledWith(ESCROW, DEVELOPER);
    expect(tokens.get(DEVELOPER)).toBe(TWENTY);
  });

  it('uses an explicit amount in base units', async () => {
    const { service, escrow } = setup();

    const report = await service.roundtrip({ developerWallet: DEVELOPER, amount: 1500n, defaultTokens: 20n });

    expect(report.ok).toBe(true);
    expect(report.amount).toEqual({ baseUnits: '1500', display: '0.0015' });
    expect(escrow.lockReward).toHaveBeenCalledWith(1500n);
  });

  it('stops at preflight when the server wallet cannot cover the amount', async () => {
    const { service, escrow } = setup(5n);

    const report = await service.roundtrip({ developerWallet: DEVELOPER, defaultTokens: 20n });

    expect(report.ok).toBe(false);
    expect(report.steps.map((s) => s.step)).toEqual(['preflight']);
    expect(failed(report)).toEqual(['server wallet holds the amount']);
    expect(escrow.lockReward).not.toHaveBeenCalled();
  });

  it('records a failed lock and does not release', async () => {
    const { service, escrow } = setup();
    escrow.lockReward.mockRejectedValue(new BadGatewayException('Locking the reward on Solana failed: 429'));

    const report = await service.roundtrip({ developerWallet: DEVELOPER, defaultTokens: 20n });

    expect(report.ok).toBe(false);
    expect(report.steps[1]).toMatchObject({ step: 'create_and_deposit', ok: false, error: expect.stringContaining('429') });
    expect(report.escrowAddress).toBeNull();
    expect(escrow.release).not.toHaveBeenCalled();
  });

  it('fails the release step when the chain does not show the payout', async () => {
    const { service, escrow, reader } = setup();
    escrow.release.mockResolvedValue('sig_release');

    const report = await service.roundtrip({ developerWallet: DEVELOPER, defaultTokens: 20n });

    expect(report.ok).toBe(false);
    expect(report.steps[2]).toMatchObject({ step: 'release', ok: false, signature: 'sig_release' });
    expect(failed(report)).toEqual(['escrow status', 'escrow developer', 'vault balance', 'developer balance']);
    // Re-read before giving up, in case the RPC node lagged behind the transaction.
    expect(reader.transactionOutcome).toHaveBeenCalledTimes(1 + 3);
  });

  it('fails a step whose transaction errored on chain', async () => {
    const { service, reader } = setup();
    reader.transactionOutcome.mockResolvedValue({ confirmation: 'confirmed', error: { InstructionError: [0, 'x'] } });

    const report = await service.roundtrip({ developerWallet: DEVELOPER, defaultTokens: 20n });

    expect(report.ok).toBe(false);
    expect(report.steps.map((s) => s.step)).toEqual(['preflight', 'create_and_deposit']);
    expect(failed(report)).toEqual(['transaction error']);
  });

  it('refuses to pay out to the server wallet', async () => {
    const { service } = setup();

    await expect(service.roundtrip({ developerWallet: ADDRESSES.client, defaultTokens: 20n })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('EscrowRoundtripService.status', () => {
  it('names what is missing before an escrow can run', async () => {
    const { service, reader } = setup(0n);
    reader.solBalance.mockResolvedValue(1_000_000);
    reader.programDeployed.mockResolvedValue(false);

    const status = await service.status();

    expect(status.ok).toBe(false);
    expect(status.rpcHost).toBe('api.devnet.solana.com');
    expect(status.issues).toEqual([
      `escrow program ${ADDRESSES.programId} is not deployed on this cluster`,
      'server wallet needs at least 0.005 SOL for escrow rent, has 0.001',
      'verifier needs at least 0.003 SOL for developer token account rent, has 0.001',
      'server wallet holds none of the reward token',
    ]);
  });
});

describe('report helpers', () => {
  it('formats base units', () => {
    expect(formatUnits(20_000_000n, 6)).toBe('20');
    expect(formatUnits(1_500n, 6)).toBe('0.0015');
    expect(formatUnits(0n, 9)).toBe('0');
    expect(formatUnits(7n, 0)).toBe('7');
  });

  it('builds explorer links without leaking a provider key', () => {
    expect(explorerUrl('tx', 'sig', 'https://devnet.helius-rpc.com/?api-key=secret')).toBe(
      'https://explorer.solana.com/tx/sig?cluster=devnet',
    );
    expect(explorerUrl('address', 'abc', 'http://127.0.0.1:8899')).toBe(
      'https://explorer.solana.com/address/abc?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899',
    );
  });
});

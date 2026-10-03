import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { EscrowReader, type TransactionOutcome } from '../escrow-reader.service';
import { EscrowService } from '../escrow.service';
import {
  check,
  type Check,
  explorerUrl,
  formatUnits,
  messageOf,
  type RoundtripReport,
  rpcHost,
  type StatusReport,
  type StepName,
  type StepReport,
} from './report';

// Rent for the escrow and vault accounts plus fees is about 0.004 SOL per escrow.
const MIN_SERVER_LAMPORTS = 5_000_000;
// The verifier pays rent for the developer's token account on first payout, about 0.0021 SOL.
const MIN_VERIFIER_LAMPORTS = 3_000_000;
const LAMPORT_DECIMALS = 9;
// RPC nodes behind a load balancer can briefly serve state from before a confirmed transaction.
const VERIFY_ATTEMPTS = 3;

export interface RoundtripInput {
  developerWallet: string;
  /** Base units; when omitted, `defaultTokens` whole tokens. */
  amount?: bigint;
  defaultTokens: bigint;
}

interface Snapshot {
  status: StatusReport;
  serverTokens: bigint;
}

/**
 * Locks a reward in a new escrow and releases it to a wallet, checking chain state
 * after each transaction. A development tool behind ESCROW_DEBUG_ENDPOINTS.
 */
@Injectable()
export class EscrowRoundtripService {
  private readonly logger = new Logger(EscrowRoundtripService.name);
  private readonly rpcUrl: string;
  /** Pause between verification attempts; tests set it to 0. */
  retryDelayMs = 1500;

  constructor(
    config: ConfigService<Env, true>,
    private readonly escrow: EscrowService,
    private readonly reader: EscrowReader,
  ) {
    this.rpcUrl = config.get('SOLANA_RPC_URL', { infer: true });
  }

  async status(): Promise<StatusReport> {
    return (await this.snapshot()).status;
  }

  async roundtrip(input: RoundtripInput): Promise<RoundtripReport> {
    const addresses = this.escrow.addresses();
    if (input.developerWallet === addresses.client || input.developerWallet === addresses.verifier) {
      throw new BadRequestException('developerWallet must not be the server wallet or the verifier');
    }

    const { decimals } = await this.reader.mintInfo();
    const amount = input.amount ?? input.defaultTokens * 10n ** BigInt(decimals);
    const developer = input.developerWallet;
    const report: RoundtripReport = {
      ok: false,
      developerWallet: developer,
      amount: { baseUnits: amount.toString(), display: formatUnits(amount, decimals) },
      escrowAddress: null,
      escrowUrl: null,
      vaultAddress: null,
      steps: [],
    };

    let serverBefore = 0n;
    let developerBefore = 0n;
    const preflightOk = await this.runStep(report, 'preflight', async (step) => {
      const { status, serverTokens } = await this.snapshot();
      serverBefore = serverTokens;
      developerBefore = await this.reader.tokenBalance(developer);
      step.checks = [
        ...status.issues.map((issue) => check(issue, 'resolved', 'unresolved', false)),
        check('server wallet holds the amount', `≥ ${report.amount.display}`, formatUnits(serverTokens, decimals), serverTokens >= amount),
      ];
    });
    if (!preflightOk) return report;

    const lockedOk = await this.runStep(report, 'create_and_deposit', async (step) => {
      const locked = await this.escrow.lockReward(amount);
      this.signed(step, locked.signature);
      report.escrowAddress = locked.escrowAddress;
      report.escrowUrl = explorerUrl('address', locked.escrowAddress, this.rpcUrl);
      report.vaultAddress = this.reader.vaultAddress(locked.escrowAddress);
      const vault = report.vaultAddress;

      step.checks = await this.settle(async () => {
        const [outcome, account, vaultTokens, serverTokens] = await Promise.all([
          this.reader.transactionOutcome(locked.signature),
          this.reader.fetchEscrow(locked.escrowAddress),
          this.reader.tokenAccountBalance(vault),
          this.reader.tokenBalance(addresses.client),
        ]);
        return [
          ...transactionChecks(outcome),
          check('escrow account exists', true, account !== null),
          ...(account
            ? [
                check('escrow status', 'funded', account.status),
                check('escrow amount', amount, account.amount),
                check('escrow client', addresses.client, account.client),
                check('escrow verifier', addresses.verifier, account.verifier),
                check('escrow token mint', addresses.tokenMint, account.tokenMint),
                check('escrow developer', null, account.developer),
              ]
            : []),
          check('vault balance', amount, vaultTokens),
          check('server wallet balance', serverBefore - amount, serverTokens),
        ];
      });
    });
    if (!lockedOk || !report.escrowAddress || !report.vaultAddress) return report;
    const escrowAddress = report.escrowAddress;
    const vault = report.vaultAddress;

    report.ok = await this.runStep(report, 'release', async (step) => {
      const signature = await this.escrow.release(escrowAddress, developer);
      this.signed(step, signature);

      step.checks = await this.settle(async () => {
        const [outcome, account, vaultTokens, developerTokens] = await Promise.all([
          this.reader.transactionOutcome(signature),
          this.reader.fetchEscrow(escrowAddress),
          this.reader.tokenAccountBalance(vault),
          this.reader.tokenBalance(developer),
        ]);
        return [
          ...transactionChecks(outcome),
          check('escrow status', 'released', account?.status ?? 'missing'),
          check('escrow developer', developer, account?.developer ?? null),
          check('vault balance', 0n, vaultTokens),
          check('developer balance', developerBefore + amount, developerTokens),
        ];
      });
    });
    return report;
  }

  private async snapshot(): Promise<Snapshot> {
    const addresses = this.escrow.addresses();
    const [programDeployed, mint, serverLamports, verifierLamports, serverTokens] = await Promise.all([
      this.reader.programDeployed(),
      this.reader.mintInfo(),
      this.reader.solBalance(addresses.client),
      this.reader.solBalance(addresses.verifier),
      this.reader.tokenBalance(addresses.client),
    ]);

    const sol = (lamports: number) => formatUnits(BigInt(lamports), LAMPORT_DECIMALS);
    const issues: string[] = [];
    if (!programDeployed) issues.push(`escrow program ${addresses.programId} is not deployed on this cluster`);
    if (serverLamports < MIN_SERVER_LAMPORTS) {
      issues.push(`server wallet needs at least ${sol(MIN_SERVER_LAMPORTS)} SOL for escrow rent, has ${sol(serverLamports)}`);
    }
    if (verifierLamports < MIN_VERIFIER_LAMPORTS) {
      issues.push(
        `verifier needs at least ${sol(MIN_VERIFIER_LAMPORTS)} SOL for developer token account rent, has ${sol(verifierLamports)}`,
      );
    }
    if (serverTokens === 0n) issues.push('server wallet holds none of the reward token');

    return {
      serverTokens,
      status: {
        ok: issues.length === 0,
        rpcHost: rpcHost(this.rpcUrl),
        programId: addresses.programId,
        programDeployed,
        tokenMint: addresses.tokenMint,
        tokenProgram: mint.tokenProgram,
        decimals: mint.decimals,
        serverWallet: {
          address: addresses.client,
          sol: sol(serverLamports),
          tokens: formatUnits(serverTokens, mint.decimals),
          tokensBaseUnits: serverTokens.toString(),
        },
        verifier: { address: addresses.verifier, sol: sol(verifierLamports) },
        issues,
      },
    };
  }

  /**
   * Runs one step and records it in the report. A thrown error ends the step, not the
   * request: the report up to that point is what the caller needs to see.
   */
  private async runStep(
    report: RoundtripReport,
    name: StepName,
    body: (step: StepReport) => Promise<void>,
  ): Promise<boolean> {
    const step: StepReport = { step: name, ok: false, checks: [], durationMs: 0 };
    report.steps.push(step);
    const started = Date.now();
    try {
      await body(step);
      step.ok = step.checks.every((c) => c.pass);
    } catch (error) {
      this.logger.warn(`escrow roundtrip step ${name} failed: ${messageOf(error)}`);
      step.error = messageOf(error);
    }
    step.durationMs = Date.now() - started;
    return step.ok;
  }

  private signed(step: StepReport, signature: string): void {
    step.signature = signature;
    step.explorerUrl = explorerUrl('tx', signature, this.rpcUrl);
  }

  /** Re-reads until every check passes or the attempts run out; returns the last result. */
  private async settle(verify: () => Promise<Check[]>): Promise<Check[]> {
    for (let attempt = 1; ; attempt++) {
      const checks = await verify();
      if (checks.every((c) => c.pass) || attempt === VERIFY_ATTEMPTS) return checks;
      await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
    }
  }
}

function transactionChecks(outcome: TransactionOutcome): Check[] {
  return [
    check(
      'transaction confirmed',
      'confirmed',
      outcome.confirmation ?? 'not found',
      outcome.confirmation === 'confirmed' || outcome.confirmation === 'finalized',
    ),
    check('transaction error', 'none', outcome.error === null ? 'none' : JSON.stringify(outcome.error)),
  ];
}

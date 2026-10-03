import { Injectable, Logger } from '@nestjs/common';
import { EscrowStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EscrowService } from '../solana/escrow.service';

/** The pull request author, as GitHub's webhook names them. */
export interface PayoutRecipient {
  /** Numeric GitHub user id; stable, unlike the login. */
  githubId: number;
  login: string;
}

/** What a merge did to the bounty's escrow. */
export type PayoutOutcome =
  | 'released'
  /** Already paid out, e.g. a redelivered webhook or a second merged pull request. */
  | 'already-released'
  /** No funded escrow behind this issue. */
  | 'not-funded'
  /** The author never signed in, so there is no wallet to pay. */
  | 'no-account'
  /** The author signed in but has not linked a wallet. */
  | 'no-wallet';

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly escrow: EscrowService,
  ) {}

  /**
   * Pays an issue's reward to the author of the merged pull request. Every merge
   * pays, whatever the review said. Authors without an account or a wallet are
   * skipped and logged.
   */
  async releaseForMerge(issueId: string, recipient: PayoutRecipient): Promise<PayoutOutcome> {
    const issue = await this.prisma.issue.findUnique({ where: { id: issueId } });
    if (!issue) throw new Error(`Issue ${issueId} does not exist`);
    if (issue.escrowStatus === EscrowStatus.RELEASED) return 'already-released';
    if (issue.escrowStatus !== EscrowStatus.FUNDED || !issue.escrowAddress) {
      this.logger.warn(`Issue ${issueId} was merged but has no funded escrow; nothing to release`);
      return 'not-funded';
    }

    const account = await this.prisma.githubAccount.findUnique({
      where: { githubId: recipient.githubId },
      include: { wallet: true },
    });
    if (!account) {
      this.logger.warn(`Issue ${issueId}: @${recipient.login} has never signed in, so the reward is not released`);
      return 'no-account';
    }
    if (!account.wallet) {
      this.logger.warn(`Issue ${issueId}: @${recipient.login} has no linked wallet, so the reward is not released`);
      return 'no-wallet';
    }
    const walletAddress = account.wallet.address;

    // One payout per issue. A row left by an earlier failed attempt is reused; if that
    // attempt did land on chain, the program answers AlreadyProcessed instead of paying twice.
    const payout = await this.prisma.payout.upsert({
      where: { issueId },
      create: { issueId, recipientGithubId: recipient.githubId, walletAddress },
      update: { recipientGithubId: recipient.githubId, walletAddress },
    });
    if (payout.releaseSignature) return 'already-released';

    const signature = await this.escrow.release(issue.escrowAddress, walletAddress);

    const releasedAt = new Date();
    try {
      await this.prisma.$transaction([
        this.prisma.payout.update({ where: { id: payout.id }, data: { releaseSignature: signature, releasedAt } }),
        this.prisma.issue.update({
          where: { id: issueId },
          data: { escrowStatus: EscrowStatus.RELEASED, paidOutToId: account.id, paidOutAt: releasedAt },
        }),
      ]);
    } catch (error) {
      // The tokens have moved; the log is the only record of where.
      this.logger.error(
        `Escrow ${issue.escrowAddress} released to ${walletAddress} (tx ${signature}) but recording it failed`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
    this.logger.log(`Issue ${issueId}: released to @${recipient.login} (${walletAddress}), tx ${signature}`);
    return 'released';
  }
}

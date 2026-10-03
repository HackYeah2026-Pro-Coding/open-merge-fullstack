import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LinkWalletInput, User, WalletChallenge } from '@escrow/shared';
import type { Env } from '../config/env';
import { toUser } from '../auth/to-user';
import { PrismaService } from '../prisma/prisma.service';
import { CHALLENGE_TTL_MS, buildMessage, createChallengeToken, readChallengeToken } from './challenge';
import { parseSolanaAddress, verifyWalletSignature } from './verify-signature';

const WITH_WALLET = { include: { wallet: true } } as const;

/**
 * Links a wallet to a GitHub account by proof of ownership. It only records an
 * address; nothing here can move funds.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async createChallenge(githubLogin: string, address: string): Promise<WalletChallenge> {
    await this.findAccount(githubLogin);
    this.assertAddress(address);
    const issuedAt = Date.now();
    const { token, payload } = createChallengeToken({ githubLogin, address, issuedAt }, this.secret());
    return {
      nonce: token,
      message: buildMessage(payload),
      expiresAt: new Date(issuedAt + CHALLENGE_TTL_MS).toISOString(),
    };
  }

  async link(githubLogin: string, input: LinkWalletInput): Promise<User> {
    const account = await this.findAccount(githubLogin);

    let payload;
    try {
      payload = readChallengeToken(input.nonce, this.secret());
    } catch (error) {
      throw new BadRequestException(`${(error as Error).message} Start again.`);
    }
    if (payload.githubLogin !== githubLogin || payload.address !== input.address) {
      throw new BadRequestException('The signing request is invalid. Start again.');
    }
    this.assertAddress(input.address);
    if (!verifyWalletSignature(input.address, buildMessage(payload), input.signature)) {
      throw new BadRequestException('The signature does not match this wallet.');
    }

    const owner = await this.prisma.wallet.findUnique({
      where: { address: input.address },
      include: { account: true },
    });
    if (owner?.account && owner.account.id !== account.id) {
      throw new ConflictException('This wallet is already linked to another GitHub account.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const wallet = owner ?? (await tx.wallet.create({ data: { address: input.address } }));
      const result = await tx.githubAccount.update({
        where: { id: account.id },
        data: { walletId: wallet.id },
        ...WITH_WALLET,
      });
      await this.dropOrphan(tx, account.walletId, wallet.id);
      return result;
    });
    return toUser(updated);
  }

  async unlink(githubLogin: string): Promise<User> {
    const account = await this.findAccount(githubLogin);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.githubAccount.update({
        where: { id: account.id },
        data: { walletId: null },
        ...WITH_WALLET,
      });
      await this.dropOrphan(tx, account.walletId, null);
      return result;
    });
    return toUser(updated);
  }

  /** A wallet row nobody points at is dead weight; payouts keep their own copy of the address. */
  private async dropOrphan(
    tx: Pick<PrismaService, 'wallet'>,
    previousId: string | null,
    keepId: string | null,
  ): Promise<void> {
    if (previousId && previousId !== keepId) await tx.wallet.delete({ where: { id: previousId } });
  }

  async findAccount(githubLogin: string) {
    const account = await this.prisma.githubAccount.findUnique({ where: { githubLogin }, ...WITH_WALLET });
    if (!account) throw new NotFoundException(`No account for @${githubLogin}.`);
    return account;
  }

  private assertAddress(address: string): void {
    try {
      parseSolanaAddress(address);
    } catch {
      throw new BadRequestException('That is not a valid Solana address.');
    }
  }

  private secret(): string {
    return this.config.get('WALLET_CHALLENGE_SECRET', { infer: true });
  }
}

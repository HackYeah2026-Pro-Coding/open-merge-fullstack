import { BadGatewayException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { EscrowService } from '../solana/escrow.service';
import { PayoutService } from './payout.service';

const ESCROW = '2UrSbhR1UhCrLTrxH5ZLAU8ytGWKg7EbVgFzAfkqQyT9';
const WALLET = 'BKMDuMMxbMzEw8cCSoxHkPWqpA8f29gHiCjn44Q3v9AN';
const recipient = { githubId: 501, login: 'ada' };

function setup() {
  const prisma = {
    issue: {
      findUnique: jest.fn().mockResolvedValue({ id: 'issue_1', escrowStatus: 'FUNDED', escrowAddress: ESCROW }),
      update: jest.fn().mockReturnValue('issue-update'),
    },
    githubAccount: {
      findUnique: jest.fn().mockResolvedValue({ id: 'account_1', githubId: 501, wallet: { address: WALLET } }),
    },
    payout: {
      upsert: jest.fn().mockResolvedValue({ id: 'payout_1', releaseSignature: null }),
      update: jest.fn().mockReturnValue('payout-update'),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const escrow = { release: jest.fn().mockResolvedValue('sig_release') };
  const service = new PayoutService(prisma as unknown as PrismaService, escrow as unknown as EscrowService);
  return { service, prisma, escrow };
}

describe('PayoutService.releaseForMerge', () => {
  it('releases the escrow to the author’s linked wallet and records it', async () => {
    const { service, prisma, escrow } = setup();

    await expect(service.releaseForMerge('issue_1', recipient)).resolves.toBe('released');

    expect(prisma.githubAccount.findUnique).toHaveBeenCalledWith({ where: { githubId: 501 }, include: { wallet: true } });
    expect(prisma.payout.upsert).toHaveBeenCalledWith({
      where: { issueId: 'issue_1' },
      create: { issueId: 'issue_1', recipientGithubId: 501, walletAddress: WALLET },
      update: { recipientGithubId: 501, walletAddress: WALLET },
    });
    expect(escrow.release).toHaveBeenCalledWith(ESCROW, WALLET);
    expect(prisma.payout.update).toHaveBeenCalledWith({
      where: { id: 'payout_1' },
      data: { releaseSignature: 'sig_release', releasedAt: expect.any(Date) },
    });
    expect(prisma.issue.update).toHaveBeenCalledWith({
      where: { id: 'issue_1' },
      data: { escrowStatus: 'RELEASED', paidOutToId: 'account_1', paidOutAt: expect.any(Date) },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(['payout-update', 'issue-update']);
  });

  it('skips an author who never signed in', async () => {
    const { service, prisma, escrow } = setup();
    prisma.githubAccount.findUnique.mockResolvedValue(null);

    await expect(service.releaseForMerge('issue_1', recipient)).resolves.toBe('no-account');
    expect(prisma.payout.upsert).not.toHaveBeenCalled();
    expect(escrow.release).not.toHaveBeenCalled();
  });

  it('skips an author without a linked wallet', async () => {
    const { service, prisma, escrow } = setup();
    prisma.githubAccount.findUnique.mockResolvedValue({ id: 'account_1', githubId: 501, wallet: null });

    await expect(service.releaseForMerge('issue_1', recipient)).resolves.toBe('no-wallet');
    expect(escrow.release).not.toHaveBeenCalled();
  });

  it('does not release an escrow twice', async () => {
    const { service, prisma, escrow } = setup();

    prisma.issue.findUnique.mockResolvedValueOnce({ id: 'issue_1', escrowStatus: 'RELEASED', escrowAddress: ESCROW });
    await expect(service.releaseForMerge('issue_1', recipient)).resolves.toBe('already-released');

    prisma.payout.upsert.mockResolvedValueOnce({ id: 'payout_1', releaseSignature: 'sig_earlier' });
    await expect(service.releaseForMerge('issue_1', recipient)).resolves.toBe('already-released');

    expect(escrow.release).not.toHaveBeenCalled();
  });

  it('releases nothing for an issue without a funded escrow', async () => {
    const { service, prisma, escrow } = setup();
    prisma.issue.findUnique.mockResolvedValue({ id: 'issue_1', escrowStatus: 'PENDING', escrowAddress: null });

    await expect(service.releaseForMerge('issue_1', recipient)).resolves.toBe('not-funded');
    expect(prisma.githubAccount.findUnique).not.toHaveBeenCalled();
    expect(escrow.release).not.toHaveBeenCalled();
  });

  it('records nothing as paid when the release fails', async () => {
    const { service, prisma, escrow } = setup();
    escrow.release.mockRejectedValue(new BadGatewayException());

    await expect(service.releaseForMerge('issue_1', recipient)).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reports a failed write after the tokens moved', async () => {
    const { service, prisma } = setup();
    const failure = new Error('connection lost');
    prisma.$transaction.mockRejectedValue(failure);

    await expect(service.releaseForMerge('issue_1', recipient)).rejects.toBe(failure);
  });
});

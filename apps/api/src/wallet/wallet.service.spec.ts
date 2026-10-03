import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import type { PrismaService } from '../prisma/prisma.service';
import { createTestWallet } from './test-keys';
import { WalletService } from './wallet.service';

const SECRET = 's'.repeat(32);

function setup(options: { walletOwner?: { id: string; account: { id: string } | null } | null } = {}) {
  const account = { id: 'acc1', githubLogin: 'ada', name: null, avatarUrl: null, walletId: null as string | null, wallet: null };
  const tx = {
    wallet: { create: jest.fn().mockResolvedValue({ id: 'w1' }), delete: jest.fn() },
    githubAccount: {
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...account, walletId: data.walletId, wallet: data.walletId ? { address: 'x', linkedAt: new Date(0) } : null }),
      ),
    },
  };
  const prisma = {
    githubAccount: { findUnique: jest.fn().mockResolvedValue(account) },
    wallet: { findUnique: jest.fn().mockResolvedValue(options.walletOwner ?? null) },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const config = { get: () => SECRET } as unknown as ConfigService<Env, true>;
  return { service: new WalletService(prisma as unknown as PrismaService, config), tx, account };
}

describe('WalletService', () => {
  it('links a wallet when the signature is valid', async () => {
    const { service, tx } = setup();
    const wallet = createTestWallet();
    const challenge = await service.createChallenge('ada', wallet.address);

    const user = await service.link('ada', {
      address: wallet.address,
      nonce: challenge.nonce,
      signature: wallet.signMessage(challenge.message),
    });

    expect(tx.wallet.create).toHaveBeenCalledWith({ data: { address: wallet.address } });
    expect(user.wallet).not.toBeNull();
  });

  it('rejects a signature over a different message', async () => {
    const { service, tx } = setup();
    const wallet = createTestWallet();
    const challenge = await service.createChallenge('ada', wallet.address);

    await expect(
      service.link('ada', { address: wallet.address, nonce: challenge.nonce, signature: wallet.signMessage('something else') }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.githubAccount.update).not.toHaveBeenCalled();
  });

  it('rejects a challenge issued for another account', async () => {
    const { service } = setup();
    const wallet = createTestWallet();
    const challenge = await service.createChallenge('eve', wallet.address);

    await expect(
      service.link('ada', { address: wallet.address, nonce: challenge.nonce, signature: wallet.signMessage(challenge.message) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a wallet already linked to another account', async () => {
    const { service } = setup({ walletOwner: { id: 'w9', account: { id: 'someone-else' } } });
    const wallet = createTestWallet();
    const challenge = await service.createChallenge('ada', wallet.address);

    await expect(
      service.link('ada', { address: wallet.address, nonce: challenge.nonce, signature: wallet.signMessage(challenge.message) }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an invalid address when creating a challenge', async () => {
    const { service } = setup();
    await expect(service.createChallenge('ada', 'not-an-address')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes the wallet row when unlinking', async () => {
    const { service, tx, account } = setup();
    account.walletId = 'w1';
    const user = await service.unlink('ada');
    expect(tx.wallet.delete).toHaveBeenCalledWith({ where: { id: 'w1' } });
    expect(user.wallet).toBeNull();
  });
});

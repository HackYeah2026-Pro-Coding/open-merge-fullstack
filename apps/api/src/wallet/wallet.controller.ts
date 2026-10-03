import { BadRequestException, Body, Controller, Delete, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { User, WalletChallenge } from '@escrow/shared';
import { z } from 'zod';
import { AccountGuard, CurrentLogin } from '../auth/current-account';
import { WalletService } from './wallet.service';

const challengeBody = z.object({ address: z.string().min(32).max(44) });
const linkBody = z.object({
  address: z.string().min(32).max(44),
  nonce: z.string().min(1).max(1024),
  signature: z.string().min(1).max(256),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(result.error.issues.map((i) => i.message).join(', '));
  return result.data;
}

@ApiTags('wallet')
@UseGuards(AccountGuard)
@Controller('me/wallet')
export class WalletController {
  constructor(private readonly wallets: WalletService) {}

  @Post('challenge')
  @HttpCode(200)
  challenge(@CurrentLogin() login: string, @Body() body: unknown): Promise<WalletChallenge> {
    return this.wallets.createChallenge(login, parse(challengeBody, body).address);
  }

  @Put()
  link(@CurrentLogin() login: string, @Body() body: unknown): Promise<User> {
    return this.wallets.link(login, parse(linkBody, body));
  }

  @Delete()
  unlink(@CurrentLogin() login: string): Promise<User> {
    return this.wallets.unlink(login);
  }
}

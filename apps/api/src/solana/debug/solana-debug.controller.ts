import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { EscrowRoundtripService } from './escrow-roundtrip.service';
import type { RoundtripReport, StatusReport } from './report';

// Mocked payout target and amount for the roundtrip, overridable in the body.
const MOCK_DEVELOPER_WALLET = 'CterLZRsD29XFT8hayBU36vJAdiCTUjbpw8vabKgK5JH';
const MOCK_TOKENS = 20n;

const roundtripBody = z
  .object({
    developerWallet: z.string().trim().min(32).max(44).default(MOCK_DEVELOPER_WALLET),
    amount: z
      .string()
      .regex(/^[1-9]\d*$/, 'a positive integer in base units')
      .transform((v) => BigInt(v))
      .optional(),
  })
  .default({ developerWallet: MOCK_DEVELOPER_WALLET });

@ApiTags('solana-debug')
@Controller('solana/debug')
export class SolanaDebugController {
  constructor(private readonly roundtrips: EscrowRoundtripService) {}

  /** Addresses, balances and anything that would stop an escrow from being locked. */
  @Get('status')
  status(): Promise<StatusReport> {
    return this.roundtrips.status();
  }

  /**
   * Locks a reward in a new escrow on chain, releases it to `developerWallet` and checks
   * chain state after each step. 200 when every check passes, 502 with the report otherwise.
   */
  @Post('escrow-roundtrip')
  @HttpCode(HttpStatus.OK)
  async roundtrip(
    @Body(new ZodValidationPipe(roundtripBody)) body: z.output<typeof roundtripBody>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RoundtripReport> {
    const report = await this.roundtrips.roundtrip({ ...body, defaultTokens: MOCK_TOKENS });
    if (!report.ok) res.status(HttpStatus.BAD_GATEWAY);
    return report;
  }
}

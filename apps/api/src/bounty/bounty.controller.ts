import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Bounty, BountyListQuery, BountySummary, CreateBountyInput } from '@escrow/shared';
import { z } from 'zod';
import { OwnerGuard } from '../auth/current-account';
import { ZodValidationPipe } from '../core/pipes/zod-validation.pipe';
import { BountyService } from './bounty.service';

/** Largest amount the escrow program accepts (its `amount` argument is a u64). */
const U64_MAX = 2n ** 64n - 1n;

const listQuery = z.object({
  repo: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['open', 'in_review', 'payout_held', 'paid', 'closed']).optional(),
  q: z.string().max(200).optional(),
  sort: z.enum(['newest', 'reward']).optional(),
}) satisfies z.ZodType<BountyListQuery>;

const createBody = z.object({
  repo: z.string().trim().min(1).max(100),
  title: z.string().trim().min(8, 'The title must be at least 8 characters.').max(256),
  body: z.string().max(65_536),
  rewardAmount: z
    .string()
    .regex(/^[1-9]\d*$/, 'The reward must be greater than zero.')
    .refine((value) => BigInt(value) <= U64_MAX, 'The reward is too large.'),
  labels: z.array(z.string().trim().min(1).max(50)).max(10),
}) satisfies z.ZodType<CreateBountyInput>;

@ApiTags('bounties')
@Controller('bounties')
export class BountyController {
  constructor(private readonly bounties: BountyService) {}

  @Get()
  @ApiOkResponse({ description: 'Bounties of the organization, filtered and sorted.' })
  @ApiBadRequestResponse({ description: 'Unknown status or sort.' })
  list(@Query(new ZodValidationPipe(listQuery)) query: BountyListQuery): Promise<BountySummary[]> {
    return this.bounties.list(query);
  }

  @Get(':repo/:number')
  @ApiOkResponse({ description: 'The bounty with its pull requests, history and payout.' })
  @ApiNotFoundResponse({ description: 'No bounty with this issue number in the repository.' })
  get(@Param('repo') repo: string, @Param('number', ParseIntPipe) issueNumber: number): Promise<Bounty> {
    return this.bounties.get(repo, issueNumber);
  }

  @Post()
  @UseGuards(OwnerGuard)
  @ApiCreatedResponse({ description: 'Reward locked, issue opened on GitHub.' })
  @ApiBadRequestResponse({ description: 'The body is invalid.' })
  @ApiForbiddenResponse({ description: 'The owner view is not open.' })
  @ApiNotFoundResponse({ description: 'The repository is not part of the organization.' })
  @ApiBadGatewayResponse({ description: 'Locking the reward or opening the GitHub issue failed.' })
  @ApiServiceUnavailableResponse({ description: 'GitHub or the escrow is not configured.' })
  create(@Body(new ZodValidationPipe(createBody)) body: CreateBountyInput): Promise<Bounty> {
    return this.bounties.create(body);
  }
}

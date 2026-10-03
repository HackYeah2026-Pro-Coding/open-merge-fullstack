import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../core/pipes/zod-validation.pipe';
import { IssueService, type IssueResponse } from './issue.service';

/** Largest amount the escrow program accepts (its `amount` argument is a u64). */
const U64_MAX = 2n ** 64n - 1n;

const createIssueSchema = z.object({
  title: z.string().trim().min(1),
  body: z.string(),
  // A digit string keeps amounts above 2^53 exact; a plain integer is accepted for convenience.
  rewardAmount: z
    .union([
      z.string().regex(/^[1-9]\d*$/, 'Expected a positive integer in base units'),
      z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    ])
    .transform((value) => BigInt(value))
    .refine((value) => value <= U64_MAX, `Must be at most ${U64_MAX} base units`),
  repoId: z.string().min(1),
  // Applied to the GitHub issue and shown on the bounty.
  labels: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
});
type CreateIssueBody = z.output<typeof createIssueSchema>;

@ApiTags('issue')
@Controller('issue')
export class IssueController {
  constructor(private readonly issues: IssueService) {}

  @Get()
  @ApiOkResponse({ description: 'All issues, newest first.' })
  list(): Promise<IssueResponse[]> {
    return this.issues.list();
  }

  @Get(':id')
  @ApiOkResponse({ description: 'The issue.' })
  @ApiNotFoundResponse({ description: 'No issue with this id.' })
  get(@Param('id') id: string): Promise<IssueResponse> {
    return this.issues.get(id);
  }

  @Post()
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'body', 'rewardAmount', 'repoId'],
      properties: {
        title: { type: 'string', example: 'Fix flaky login test' },
        body: { type: 'string', example: 'The login test fails about one run in ten.' },
        rewardAmount: {
          type: 'string',
          description: 'Integer base units of the reward token.',
          example: '5000000',
        },
        repoId: { type: 'string', description: 'Id of a stored repository.' },
        labels: { type: 'array', items: { type: 'string' }, example: ['bug'] },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Reward locked in a new Solana escrow, issue stored with the escrow address and opened on GitHub.',
  })
  @ApiBadRequestResponse({ description: 'The body is invalid.' })
  @ApiNotFoundResponse({ description: 'No repository with this id.' })
  @ApiBadGatewayResponse({
    description:
      'Locking the reward on Solana failed and nothing is saved, or GitHub refused to open the issue and the funded bounty is saved without one; retry that with POST /issue/:id/github.',
  })
  @ApiServiceUnavailableResponse({
    description: 'GITHUB_TOKEN or SERVER_WALLET_KEYPAIR_B64 is not set. Nothing is saved.',
  })
  create(
    @Body(new ZodValidationPipe(createIssueSchema)) body: CreateIssueBody,
  ): Promise<IssueResponse> {
    return this.issues.create(body);
  }

  @Post(':id/github')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'GitHub issue opened and linked.' })
  @ApiNotFoundResponse({ description: 'No issue with this id.' })
  @ApiConflictResponse({ description: 'The issue is already on GitHub.' })
  @ApiBadGatewayResponse({ description: 'GitHub refused again. Nothing changed; retry later.' })
  @ApiServiceUnavailableResponse({ description: 'GITHUB_TOKEN is not set.' })
  retryGithub(@Param('id') id: string): Promise<IssueResponse> {
    return this.issues.retryGithub(id);
  }
}

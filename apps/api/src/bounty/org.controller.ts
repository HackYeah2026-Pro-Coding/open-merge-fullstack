import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {
  ActivityItem,
  AddRepositoryInput,
  GithubRepository,
  Organization,
  OrganizationStats,
  RepositorySummary,
} from '@escrow/shared';
import { z } from 'zod';
import { OwnerGuard } from '../auth/current-account';
import { ZodValidationPipe } from '../core/pipes/zod-validation.pipe';
import { OrgReposService } from './org-repos.service';
import { OrgService } from './org.service';

const activityQuery = z.object({ repo: z.string().trim().min(1).max(100).optional() });

const addRepoBody = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{1,100}$/, 'Expected a repository name like "taskq".'),
}) satisfies z.ZodType<AddRepositoryInput>;

@ApiTags('org')
@Controller('org')
export class OrgController {
  constructor(
    private readonly org: OrgService,
    private readonly orgRepos: OrgReposService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'The organization and its owner.' })
  organization(): Organization {
    return this.org.organization();
  }

  @Get('stats')
  @ApiOkResponse({ description: 'Totals across every bounty of the organization.' })
  stats(): Promise<OrganizationStats> {
    return this.org.stats();
  }

  @Get('activity')
  @ApiOkResponse({ description: 'Latest bounty events, across the organization or in one repository.' })
  activity(@Query(new ZodValidationPipe(activityQuery)) query: z.output<typeof activityQuery>): Promise<ActivityItem[]> {
    return this.org.activity(query.repo);
  }

  @Get('repos')
  @ApiOkResponse({ description: 'Repositories of the organization, most recently active first.' })
  repositories(): Promise<RepositorySummary[]> {
    return this.org.repositories();
  }

  @Post('repos')
  @UseGuards(OwnerGuard)
  @ApiCreatedResponse({ description: 'Repository added; it shows on the dashboard and can carry bounties.' })
  @ApiBadRequestResponse({ description: 'The name is invalid, or the repository is archived.' })
  @ApiForbiddenResponse({ description: 'The owner view is not open.' })
  @ApiNotFoundResponse({ description: 'GitHub has no such repository in the organization.' })
  @ApiConflictResponse({ description: 'The repository is already added.' })
  @ApiBadGatewayResponse({ description: 'GitHub returned an unexpected error, such as a rate limit.' })
  addRepository(@Body(new ZodValidationPipe(addRepoBody)) body: AddRepositoryInput): Promise<RepositorySummary> {
    return this.orgRepos.add(body.name);
  }

  @Get('github/repos')
  @UseGuards(OwnerGuard)
  @ApiOkResponse({ description: 'Repositories of the organization on GitHub, most recently pushed first, marked when added.' })
  @ApiForbiddenResponse({ description: 'The owner view is not open.' })
  @ApiBadGatewayResponse({ description: 'GitHub refused to list the repositories.' })
  @ApiServiceUnavailableResponse({ description: 'GITHUB_TOKEN is not set.' })
  githubRepositories(): Promise<GithubRepository[]> {
    return this.orgRepos.onGithub();
  }

  @Get('repos/:name')
  @ApiOkResponse({ description: 'One repository with its bounty totals.' })
  @ApiNotFoundResponse({ description: 'The repository is not part of the organization.' })
  repository(@Param('name') name: string): Promise<RepositorySummary> {
    return this.org.repository(name);
  }
}

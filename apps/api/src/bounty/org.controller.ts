import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { ActivityItem, Organization, OrganizationStats, RepositorySummary } from '@escrow/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../core/pipes/zod-validation.pipe';
import { OrgService } from './org.service';

const activityQuery = z.object({ repo: z.string().trim().min(1).max(100).optional() });

@ApiTags('org')
@Controller('org')
export class OrgController {
  constructor(private readonly org: OrgService) {}

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

  @Get('repos/:name')
  @ApiOkResponse({ description: 'One repository with its bounty totals.' })
  @ApiNotFoundResponse({ description: 'The repository is not part of the organization.' })
  repository(@Param('name') name: string): Promise<RepositorySummary> {
    return this.org.repository(name);
  }
}

import { Module } from '@nestjs/common';
import { AccountGuard, OwnerGuard } from '../auth/current-account';
import { GithubModule } from '../github/github.module';
import { IssueModule } from '../issue/issue.module';
import { BountyController } from './bounty.controller';
import { BountyService } from './bounty.service';
import { MeController } from './me.controller';
import { OrgReposService } from './org-repos.service';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';

/** Read side of bounties for the web app, plus creating one through IssueService and adding repositories. */
@Module({
  imports: [IssueModule, GithubModule],
  controllers: [OrgController, BountyController, MeController],
  providers: [BountyService, OrgService, OrgReposService, AccountGuard, OwnerGuard],
})
export class BountyModule {}

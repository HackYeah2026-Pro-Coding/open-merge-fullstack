import { Module } from '@nestjs/common';
import { AccountGuard, OwnerGuard } from '../auth/current-account';
import { IssueModule } from '../issue/issue.module';
import { BountyController } from './bounty.controller';
import { BountyService } from './bounty.service';
import { MeController } from './me.controller';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';

/** Read side of bounties for the web app, plus creating one through IssueService. */
@Module({
  imports: [IssueModule],
  controllers: [OrgController, BountyController, MeController],
  providers: [BountyService, OrgService, AccountGuard, OwnerGuard],
})
export class BountyModule {}

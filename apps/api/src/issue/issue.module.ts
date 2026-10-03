import { Module } from '@nestjs/common';
import { GithubModule } from '../github/github.module';
import { SolanaModule } from '../solana/solana.module';
import { IssueController } from './issue.controller';
import { IssueService } from './issue.service';

@Module({
  imports: [GithubModule, SolanaModule],
  controllers: [IssueController],
  providers: [IssueService],
})
export class IssueModule {}

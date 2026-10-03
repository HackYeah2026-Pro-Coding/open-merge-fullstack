import { Module } from '@nestjs/common';
import { GithubClearService } from './github-clear.service';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';

@Module({
  controllers: [GithubController],
  providers: [GithubService, GithubClearService],
  exports: [GithubService],
})
export class GithubModule {}

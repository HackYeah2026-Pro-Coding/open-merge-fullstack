import { Module } from '@nestjs/common';
import { GithubModule } from '../github/github.module';
import { RepoController } from './repo.controller';
import { RepoService } from './repo.service';

@Module({
  imports: [GithubModule],
  controllers: [RepoController],
  providers: [RepoService],
})
export class RepoModule {}

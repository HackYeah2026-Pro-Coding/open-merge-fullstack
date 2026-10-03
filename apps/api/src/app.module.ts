import * as path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { SolanaModule } from './solana/solana.module';
import { MergeModule } from './merge/merge.module';
import { RepoModule } from './repo/repo.module';
import { IssueModule } from './issue/issue.module';
import { ReviewModule } from './review/review.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // One .env at the monorepo root, shared with Prisma and Vite.
      envFilePath: [path.resolve(__dirname, '../../../.env')],
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    SolanaModule,
    MergeModule,
    RepoModule,
    AuthModule,
    WalletModule,
    IssueModule,
    ReviewModule,
    // Feature modules go here.
  ],
})
export class AppModule {}

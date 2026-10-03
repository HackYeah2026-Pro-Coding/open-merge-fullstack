import * as path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { SolanaModule } from './solana/solana.module';
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
    AuthModule,
    WalletModule,
    // Feature modules go here.
  ],
})
export class AppModule {}

import * as path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';

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
    // Feature modules go here.
  ],
})
export class AppModule {}

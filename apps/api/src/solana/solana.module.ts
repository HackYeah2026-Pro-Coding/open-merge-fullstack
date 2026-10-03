import { Module } from '@nestjs/common';
import { SolanaController } from './solana.controller';

@Module({ controllers: [SolanaController] })
export class SolanaModule {}

import { Module } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { SolanaController } from './solana.controller';

@Module({
  controllers: [SolanaController],
  providers: [EscrowService],
  exports: [EscrowService],
})
export class SolanaModule {}

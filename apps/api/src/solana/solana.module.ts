import { Module } from '@nestjs/common';
import { SolanaDebugController } from './debug/solana-debug.controller';
import { EscrowRoundtripService } from './debug/escrow-roundtrip.service';
import { EscrowReader } from './escrow-reader.service';
import { EscrowService } from './escrow.service';
import { SolanaController } from './solana.controller';

@Module({
  controllers: [SolanaController, SolanaDebugController],
  providers: [EscrowService, EscrowReader, EscrowRoundtripService],
  exports: [EscrowService],
})
export class SolanaModule {}

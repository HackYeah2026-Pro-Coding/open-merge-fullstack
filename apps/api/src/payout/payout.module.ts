import { Module } from '@nestjs/common';
import { SolanaModule } from '../solana/solana.module';
import { PayoutService } from './payout.service';

@Module({
  imports: [SolanaModule],
  providers: [PayoutService],
  exports: [PayoutService],
})
export class PayoutModule {}

import { Module } from '@nestjs/common';
import { PayoutModule } from '../payout/payout.module';
import { ReviewModule } from '../review/review.module';
import { MergeController } from './merge.controller';
import { MergeService } from './merge.service';

@Module({
  imports: [ReviewModule, PayoutModule],
  controllers: [MergeController],
  providers: [MergeService],
})
export class MergeModule {}

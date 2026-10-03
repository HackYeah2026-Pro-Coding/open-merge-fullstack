import { Module } from '@nestjs/common';
import { AccountGuard } from '../auth/current-account';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({ controllers: [WalletController], providers: [WalletService, AccountGuard] })
export class WalletModule {}

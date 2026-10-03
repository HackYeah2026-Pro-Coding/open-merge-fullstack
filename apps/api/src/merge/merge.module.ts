import { Module } from '@nestjs/common';
import { MergeController } from './merge.controller';

@Module({ controllers: [MergeController] })
export class MergeModule {}

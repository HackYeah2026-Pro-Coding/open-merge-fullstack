import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { MySubmission } from '@escrow/shared';
import { AccountGuard, CurrentLogin } from '../auth/current-account';
import { BountyService } from './bounty.service';

@ApiTags('me')
@UseGuards(AccountGuard)
@Controller('me')
export class MeController {
  constructor(private readonly bounties: BountyService) {}

  @Get('submissions')
  @ApiOkResponse({ description: 'Pull requests the signed-in developer opened against bounties, and what they paid.' })
  @ApiUnauthorizedResponse({ description: 'Not signed in with GitHub.' })
  submissions(@CurrentLogin() login: string): Promise<MySubmission[]> {
    return this.bounties.mySubmissions(login);
  }
}

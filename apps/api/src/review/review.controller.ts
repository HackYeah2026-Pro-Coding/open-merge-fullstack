import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Submission } from '@escrow/shared';
import { SignedInGuard } from '../auth/current-account';
import { ReviewService } from './review.service';

@ApiTags('review')
@Controller('review')
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get('issues/:issueId/submissions')
  @ApiOkResponse({ description: 'Pull requests for a bounty issue, with the AI review of each head commit.' })
  @ApiNotFoundResponse({ description: 'No issue with this id.' })
  submissions(@Param('issueId') issueId: string): Promise<Submission[]> {
    return this.reviews.listSubmissions(issueId);
  }

  @Post(':reviewId/rerun')
  @UseGuards(SignedInGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The review runs again in the background.' })
  @ApiUnauthorizedResponse({ description: 'Neither the owner view is open nor a developer signed in with GitHub.' })
  @ApiNotFoundResponse({ description: 'No review with this id.' })
  @ApiConflictResponse({ description: 'The review did not end in an error, or is already running.' })
  rerun(@Param('reviewId') reviewId: string): Promise<void> {
    return this.reviews.rerun(reviewId);
  }
}

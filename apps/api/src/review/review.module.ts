import { Module } from '@nestjs/common';
import { GithubModule } from '../github/github.module';
import { DEFAULT_CI_WAIT } from './ci-status';
import { GithubReviewClient } from './github-review.client';
import { ReviewController } from './review.controller';
import { CI_WAIT_OPTIONS, ReviewRunner } from './review.runner';
import { ReviewService } from './review.service';
import { ReviewWebhookController } from './review-webhook.controller';
import { ClaudeReviewer } from './reviewers/claude.reviewer';
import { GeminiReviewer } from './reviewers/gemini.reviewer';
import { REVIEWERS } from './reviewers/reviewer';

@Module({
  imports: [GithubModule],
  controllers: [ReviewWebhookController, ReviewController],
  providers: [
    GithubReviewClient,
    ReviewRunner,
    ReviewService,
    ClaudeReviewer,
    GeminiReviewer,
    { provide: REVIEWERS, useFactory: (claude: ClaudeReviewer, gemini: GeminiReviewer) => [claude, gemini], inject: [ClaudeReviewer, GeminiReviewer] },
    { provide: CI_WAIT_OPTIONS, useValue: DEFAULT_CI_WAIT },
  ],
})
export class ReviewModule {}

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../core/pipes/zod-validation.pipe';
import { GithubClearService, type ClearResult } from './github-clear.service';
import { parseGithubRepoUrl } from './github-repo-url';

const clearSchema = z.object({
  url: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const ref = parseGithubRepoUrl(value);
      if (!ref) {
        ctx.addIssue({ code: 'custom', message: 'Expected a GitHub repository URL like https://github.com/owner/name' });
        return z.NEVER;
      }
      return ref;
    }),
  /** The repo's "owner/name" typed again, so a pasted URL alone cannot wipe a repo. */
  confirm: z.string().trim(),
});
type ClearBody = z.output<typeof clearSchema>;

@ApiTags('github')
@Controller('github')
export class GithubController {
  constructor(private readonly clearer: GithubClearService) {}

  @Post('clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset a stored repository on GitHub. Cannot be undone.',
    description:
      'Closes open pull requests, deletes every branch except main and the default branch, and deletes issues. ' +
      'Issues with a bounty in the database are skipped. Pull requests cannot be deleted on GitHub and stay closed.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['url', 'confirm'],
      properties: {
        url: { type: 'string', example: 'https://github.com/HackYeah2026-Pro-Coding/open-merge-test1' },
        confirm: { type: 'string', example: 'HackYeah2026-Pro-Coding/open-merge-test1' },
      },
    },
  })
  @ApiOkResponse({ description: 'What was cleared, what was skipped, and what GitHub refused.' })
  @ApiBadRequestResponse({ description: 'Invalid URL, or confirm does not match the repository name.' })
  @ApiNotFoundResponse({ description: 'The repository is not added with POST /repo.' })
  @ApiBadGatewayResponse({ description: 'GitHub refused to list the repository contents.' })
  @ApiServiceUnavailableResponse({ description: 'GITHUB_TOKEN is not set.' })
  clear(@Body(new ZodValidationPipe(clearSchema)) body: ClearBody): Promise<ClearResult> {
    return this.clearer.clear(body.url, body.confirm);
  }
}

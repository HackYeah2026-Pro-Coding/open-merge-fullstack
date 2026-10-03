import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  type ApiBodyOptions,
} from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../core/pipes/zod-validation.pipe';
import { parseGithubRepoUrl } from '../github/github-repo-url';
import { RepoService, type RepoResponse } from './repo.service';

/** Body of both create and update: the repo is always identified by its GitHub URL. */
const repoUrlSchema = z.object({
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
});
type RepoUrlBody = z.output<typeof repoUrlSchema>;

const REPO_URL_BODY: ApiBodyOptions = {
  schema: {
    type: 'object',
    required: ['url'],
    properties: { url: { type: 'string', example: 'https://github.com/nestjs/nest' } },
  },
};

@ApiTags('repo')
@Controller('repo')
export class RepoController {
  constructor(private readonly repos: RepoService) {}

  @Get()
  @ApiOkResponse({ description: 'All stored repositories, newest first.' })
  list(): Promise<RepoResponse[]> {
    return this.repos.list();
  }

  @Get(':id')
  @ApiOkResponse({ description: 'The repository.' })
  @ApiNotFoundResponse({ description: 'No repository with this id.' })
  get(@Param('id') id: string): Promise<RepoResponse> {
    return this.repos.get(id);
  }

  @Post()
  @ApiBody(REPO_URL_BODY)
  @ApiCreatedResponse({ description: 'Repository stored under its GitHub name.' })
  @ApiBadRequestResponse({ description: 'The URL is not a GitHub repository URL.' })
  @ApiNotFoundResponse({ description: 'GitHub has no such repository, or it is private and the token cannot see it.' })
  @ApiConflictResponse({ description: 'The repository is already added.' })
  @ApiBadGatewayResponse({ description: 'GitHub returned an unexpected error, such as a rate limit.' })
  create(
    @Body(new ZodValidationPipe(repoUrlSchema)) body: RepoUrlBody,
  ): Promise<RepoResponse> {
    return this.repos.create(body.url);
  }

  @Patch(':id')
  @ApiBody(REPO_URL_BODY)
  @ApiOkResponse({ description: 'Repository re-read from GitHub and updated.' })
  @ApiBadRequestResponse({ description: 'The URL is not a GitHub repository URL.' })
  @ApiNotFoundResponse({ description: 'No repository with this id, or GitHub has no such repository.' })
  @ApiConflictResponse({ description: 'Another stored repository already has this name.' })
  @ApiBadGatewayResponse({ description: 'GitHub returned an unexpected error, such as a rate limit.' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(repoUrlSchema)) body: RepoUrlBody,
  ): Promise<RepoResponse> {
    return this.repos.update(id, body.url);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Repository deleted.' })
  @ApiNotFoundResponse({ description: 'No repository with this id.' })
  @ApiConflictResponse({ description: 'The repository still has bounties.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.repos.remove(id);
  }
}

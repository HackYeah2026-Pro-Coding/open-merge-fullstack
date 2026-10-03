import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type GithubRepo } from '../generated/prisma/client';
import { GithubService } from '../github/github.service';
import type { GithubRepoRef } from '../github/github-repo-url';
import { PrismaService } from '../prisma/prisma.service';

export interface RepoResponse {
  id: string;
  /** "owner/name", as GitHub shows it. */
  name: string;
  url: string;
  createdAt: string;
}

function toResponse(repo: GithubRepo): RepoResponse {
  return {
    id: repo.id,
    name: repo.githubRepoName,
    url: repo.githubRepoUrl,
    createdAt: repo.createdAt.toISOString(),
  };
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

@Injectable()
export class RepoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubService,
  ) {}

  async list(): Promise<RepoResponse[]> {
    const repos = await this.prisma.githubRepo.findMany({ orderBy: { createdAt: 'desc' } });
    return repos.map(toResponse);
  }

  async get(id: string): Promise<RepoResponse> {
    const repo = await this.prisma.githubRepo.findUnique({ where: { id } });
    if (!repo) throw new NotFoundException(`Repository ${id} does not exist`);
    return toResponse(repo);
  }

  /** Looks the repository up on GitHub and stores it under its canonical name. */
  async create(ref: GithubRepoRef): Promise<RepoResponse> {
    const info = await this.github.getRepo(ref);

    try {
      const repo = await this.prisma.githubRepo.create({
        data: { githubRepoName: info.fullName, githubRepoUrl: info.htmlUrl },
      });
      return toResponse(repo);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`Repository ${info.fullName} is already added`);
      }
      throw error;
    }
  }

  /** Points a stored repo at another GitHub URL, re-reading its canonical name. */
  async update(id: string, ref: GithubRepoRef): Promise<RepoResponse> {
    // Checked first so an unknown id fails without spending a GitHub request.
    await this.get(id);
    const info = await this.github.getRepo(ref);

    try {
      const repo = await this.prisma.githubRepo.update({
        where: { id },
        data: { githubRepoName: info.fullName, githubRepoUrl: info.htmlUrl },
      });
      return toResponse(repo);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`Repository ${info.fullName} is already added`);
      }
      // Deleted between the check above and this write.
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException(`Repository ${id} does not exist`);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.githubRepo.delete({ where: { id } });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException(`Repository ${id} does not exist`);
      }
      // Issues reference the repo without cascading, so bounties block the delete.
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException(`Repository ${id} still has bounties and cannot be deleted`);
      }
      throw error;
    }
  }
}

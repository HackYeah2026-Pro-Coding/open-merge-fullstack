import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@escrow/shared';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Proves the process is up AND that Postgres answers. */
  @Get()
  async check(): Promise<HealthResponse> {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      database: 'up',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  /**
   * Keep-alive target for an external cron (every 5 minutes), so the free-tier
   * host never idles long enough to spin the instance down. Skips the database
   * on purpose: a Postgres hiccup must not make the pinger mark the job failed.
   * Express answers HEAD on GET routes too, for pingers that only send HEAD.
   */
  @Get('ping')
  @Header('Cache-Control', 'no-store')
  ping(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }
}

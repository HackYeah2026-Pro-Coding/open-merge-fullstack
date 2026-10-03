import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@escrow/shared';
import { PrismaService } from '../prisma/prisma.service';

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
}

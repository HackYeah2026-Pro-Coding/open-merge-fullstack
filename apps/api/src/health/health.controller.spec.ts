import { HealthController } from './health.controller';
import type { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  it('answers the keep-alive ping without touching the database', () => {
    const queryRaw = jest.fn();
    const controller = new HealthController({ $queryRaw: queryRaw } as unknown as PrismaService);

    expect(controller.ping()).toEqual({ status: 'ok', uptimeSeconds: expect.any(Number) });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { LivenessResponse, ReadinessResponse } from '@luminai/contracts';
import type { FastifyReply } from 'fastify';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** The process is running and can serve HTTP. Does not touch dependencies. */
  @Get('live')
  live(): LivenessResponse {
    return { status: 'ok' };
  }

  /** Whether the API can serve real traffic: 200 when ready, 503 when degraded. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<ReadinessResponse> {
    const result = await this.health.readiness();
    void reply.status(result.status === 'ready' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    void reply.header('cache-control', 'no-store');
    return result;
  }
}

import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Public } from '../../../shared/decorators/public.decorator';
import { ErrorResponseDto } from '../../../shared/swagger/error-response.dto';
import { DatabaseHealthIndicator } from '../infrastructure/database-health.indicator';
import { HealthDto } from './dto/health.dto';

/**
 * Liveness + readiness probe used by the container health check. Public, but counted against the default per-IP
 * limit like every route: each call runs a query, and the probe (every 10 s) stays far below that limit.
 */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseHealthIndicator,
    @InjectPinoLogger(HealthController.name) private readonly logger: PinoLogger,
  ) {}

  @Get()
  @ApiOperation({ summary: 'API and database health' })
  @ApiOkResponse({ type: HealthDto })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable', type: ErrorResponseDto })
  async check(): Promise<HealthDto> {
    try {
      await this.database.ping();
    } catch (error) {
      this.logger.warn({ err: error }, 'Database health check failed');
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok', db: 'up' };
  }
}

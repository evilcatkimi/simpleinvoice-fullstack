import { Module } from '@nestjs/common';
import { DatabaseHealthIndicator } from './infrastructure/database-health.indicator';
import { HealthController } from './presentation/health.controller';

@Module({
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator],
})
export class HealthModule {}

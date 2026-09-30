import { Module } from '@nestjs/common';
import { CurrenciesController } from './presentation/currencies.controller';

@Module({
  controllers: [CurrenciesController],
})
export class CurrenciesModule {}

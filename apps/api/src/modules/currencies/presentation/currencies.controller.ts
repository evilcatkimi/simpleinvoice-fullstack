import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuth } from '../../../shared/swagger/api-docs.decorators';
import { SUPPORTED_CURRENCIES } from '../domain/currencies';
import { CurrencyDto } from './currency.dto';

@ApiTags('currencies')
@ApiAuth()
@Controller('currencies')
export class CurrenciesController {
  @Get()
  @ApiOperation({ summary: 'Currencies accepted when creating an invoice' })
  @ApiOkResponse({ type: [CurrencyDto] })
  list(): readonly CurrencyDto[] {
    return SUPPORTED_CURRENCIES;
  }
}

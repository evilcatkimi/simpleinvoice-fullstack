import { ApiProperty } from '@nestjs/swagger';
import { SUPPORTED_CURRENCY_CODES, type CurrencyCode } from '../domain/currencies';

export class CurrencyDto {
  @ApiProperty({ enum: SUPPORTED_CURRENCY_CODES, example: 'AUD' })
  code: CurrencyCode;

  @ApiProperty({ example: 'AU$' })
  symbol: string;

  @ApiProperty({ example: 'Australian Dollar' })
  name: string;
}

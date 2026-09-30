import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDate, IsOnOrAfter } from '../../../../shared/validation/date.validators';
import { MaxDecimalPlaces } from '../../../../shared/validation/max-decimal-places.validator';
import { NoControlCharacters } from '../../../../shared/validation/no-control-characters.validator';
import { ToUpperCase, Trim, TrimToNull } from '../../../../shared/validation/transforms';
import { SUPPORTED_CURRENCY_CODES } from '../../../currencies/domain/currencies';
import type { CreateInvoiceCommand } from '../../application/invoices.service';
import { DEFAULT_DISCOUNT, DEFAULT_TAX_RATE } from '../../domain/invoice-calculator';

/** Starts with a letter or digit; then letters, digits and . _ / # - (no spaces or control characters). */
const INVOICE_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/#-]*$/;
// A literal space, not \s: \s would also admit tabs and line breaks.
const MOBILE_NUMBER_PATTERN = /^[+0-9()\- ]*$/;

export class CustomerDto {
  @ApiProperty({ example: 'Jane Doe', maxLength: 120 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @NoControlCharacters()
  fullname: string;

  @ApiProperty({ example: 'jane@example.com', maxLength: 254 })
  @Trim()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional({ example: '+61 400 000 000', maxLength: 32, nullable: true, type: String })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(MOBILE_NUMBER_PATTERN, {
    message: 'mobileNumber may only contain digits, spaces and + ( ) -',
  })
  mobileNumber?: string | null;

  @ApiPropertyOptional({
    example: 'Sydney NSW, Australia',
    maxLength: 255,
    nullable: true,
    type: String,
  })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @NoControlCharacters({ multiline: true })
  address?: string | null;
}

export class CreateInvoiceItemDto {
  @ApiProperty({ example: 'Consulting', maxLength: 200 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @NoControlCharacters()
  name: string;

  @ApiProperty({ example: 2, minimum: 1, maximum: 1_000_000 })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;

  @ApiProperty({ example: 150.5, exclusiveMinimum: true, minimum: 0, maximum: 1_000_000_000 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(1_000_000_000)
  @MaxDecimalPlaces(2)
  rate: number;
}

/**
 * Totals, status, currencySymbol and createdBy are deliberately absent: they are computed or assigned by the server,
 * and the global ValidationPipe (forbidNonWhitelisted) rejects requests that try to send them.
 */
export class CreateInvoiceDto implements CreateInvoiceCommand {
  @ApiProperty({ example: 'INV-2026-0100', maxLength: 50, pattern: INVOICE_NUMBER_PATTERN.source })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(INVOICE_NUMBER_PATTERN, {
    message:
      'invoiceNumber must start with a letter or digit and contain only letters, digits and . _ / # -',
  })
  invoiceNumber: string;

  @ApiPropertyOptional({ example: 'PO-778', maxLength: 100, nullable: true, type: String })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @NoControlCharacters()
  invoiceReference?: string | null;

  @ApiProperty({ example: '2026-09-29', format: 'date' })
  @IsCalendarDate()
  invoiceDate: string;

  @ApiProperty({
    example: '2026-10-29',
    format: 'date',
    description: 'Must be on or after invoiceDate',
  })
  @IsCalendarDate()
  @IsOnOrAfter('invoiceDate')
  dueDate: string;

  @ApiProperty({ enum: SUPPORTED_CURRENCY_CODES, example: 'AUD' })
  @ToUpperCase()
  @IsIn(SUPPORTED_CURRENCY_CODES, {
    message: `currency must be one of: ${SUPPORTED_CURRENCY_CODES.join(', ')}`,
  })
  currency: string;

  @ApiPropertyOptional({
    example: 'September consulting',
    maxLength: 500,
    nullable: true,
    type: String,
  })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @NoControlCharacters({ multiline: true })
  description?: string | null;

  @ApiProperty({ type: CustomerDto })
  @IsDefined()
  // @ValidateNested alone accepts an array of customers (it validates each element).
  @IsObject()
  @ValidateNested()
  @Type(() => CustomerDto)
  customer: CustomerDto;

  @ApiProperty({
    type: [CreateInvoiceItemDto],
    minItems: 1,
    maxItems: 1,
    description: 'Exactly one line item (the data model supports several).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  // Without it, a nested array ([[item]]) passes @ValidateNested and reaches the calculator.
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @ApiPropertyOptional({ example: 10, default: DEFAULT_TAX_RATE, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  @MaxDecimalPlaces(2)
  taxRate?: number = DEFAULT_TAX_RATE;

  @ApiPropertyOptional({
    example: 0,
    default: DEFAULT_DISCOUNT,
    minimum: 0,
    description: 'Absolute amount in the invoice currency; must not exceed subtotal + tax.',
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @MaxDecimalPlaces(2)
  discount?: number = DEFAULT_DISCOUNT;
}

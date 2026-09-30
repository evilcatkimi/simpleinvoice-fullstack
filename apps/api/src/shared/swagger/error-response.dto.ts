import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ErrorResponseBody } from '../filters/all-exceptions.filter';

/** OpenAPI schema of the body produced by AllExceptionsFilter. */
export class ErrorResponseDto implements ErrorResponseBody {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({
    description: 'An array of messages for validation errors, a single message otherwise.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['dueDate must be on or after invoiceDate'],
  })
  message: string | string[];

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: '/invoices' })
  path: string;

  @ApiProperty({ example: '2026-09-29T04:00:00.000Z', format: 'date-time' })
  timestamp: string;

  @ApiPropertyOptional({ example: '0f8d9a52-3c1e-4d57-9d6b-2a8e1c5b7f10' })
  requestId?: string;
}

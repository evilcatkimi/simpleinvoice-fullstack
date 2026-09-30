import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { ApiAuth, ApiErrorResponses } from '../../../shared/swagger/api-docs.decorators';
import { InvoicesService } from '../application/invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceDetailDto, InvoicePageDto } from './dto/invoice-response.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { toInvoiceDetailDto, toInvoicePageDto } from './invoice-response.mapper';

@ApiTags('invoices')
@ApiAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'Search, filter, sort and paginate invoices' })
  @ApiOkResponse({ type: InvoicePageDto })
  @ApiErrorResponses(400)
  async list(@Query() query: ListInvoicesQueryDto): Promise<InvoicePageDto> {
    return toInvoicePageDto(await this.invoicesService.search(query));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Invoice detail with customer, line items and totals' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: InvoiceDetailDto })
  @ApiErrorResponses(400, 404)
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceDetailDto> {
    return toInvoiceDetailDto(await this.invoicesService.getById(id));
  }

  @Post()
  @ApiOperation({
    summary: 'Create a Draft invoice (totals are computed by the server)',
    description:
      'Cookie-authenticated calls must send X-Requested-With: XMLHttpRequest (CSRF protection).',
  })
  @ApiCreatedResponse({
    type: InvoiceDetailDto,
    headers: { Location: { description: 'URL of the new invoice', schema: { type: 'string' } } },
  })
  @ApiErrorResponses(400, 403, 409, 413, 415)
  async create(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<InvoiceDetailDto> {
    const invoice = toInvoiceDetailDto(await this.invoicesService.create(dto, user.id));
    response.location(`/invoices/${invoice.invoiceId}`);
    return invoice;
  }
}

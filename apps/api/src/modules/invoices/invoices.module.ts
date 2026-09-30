import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceRepository } from './application/invoice.repository';
import { InvoicesService } from './application/invoices.service';
import { InvoiceItemEntity } from './infrastructure/invoice-item.entity';
import { InvoiceEntity } from './infrastructure/invoice.entity';
import { TypeOrmInvoiceRepository } from './infrastructure/typeorm-invoice.repository';
import { InvoicesController } from './presentation/invoices.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceEntity, InvoiceItemEntity])],
  controllers: [InvoicesController],
  providers: [InvoicesService, { provide: InvoiceRepository, useClass: TypeOrmInvoiceRepository }],
})
export class InvoicesModule {}

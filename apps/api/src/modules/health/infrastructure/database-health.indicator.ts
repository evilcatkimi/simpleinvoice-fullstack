import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(private readonly dataSource: DataSource) {}

  /** Round-trips a trivial query through the connection pool; rejects when PostgreSQL is unreachable. */
  async ping(): Promise<void> {
    await this.dataSource.query('SELECT 1');
  }
}

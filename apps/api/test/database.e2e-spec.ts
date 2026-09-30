import { DataSource, type Logger } from 'typeorm';
import { DatabaseEnvironment, validateEnvironment } from '../src/config/environment';
import { buildDataSourceOptions } from '../src/infrastructure/database/typeorm-options';
import { currentE2eRun } from './setup/test-environment';
import { createTestApp } from './utils/test-app';

/** Records every statement TypeORM sends, including the ones its driver runs right after connecting. */
function recordingLogger(statements: string[]): Logger {
  const ignore = () => undefined;
  return {
    logQuery: (query) => void statements.push(query),
    logQueryError: ignore,
    logQuerySlow: ignore,
    logSchemaBuild: ignore,
    logMigration: ignore,
    log: ignore,
  };
}

describe('Database connection (e2e)', () => {
  it('runs no DDL when connecting: the runtime role could not, and TypeORM used to try CREATE EXTENSION', async () => {
    const statements: string[] = [];
    const dataSource = new DataSource({
      ...buildDataSourceOptions(validateEnvironment(DatabaseEnvironment, process.env)),
      logger: recordingLogger(statements),
    });

    await dataSource.initialize();
    await dataSource.destroy();

    // The recorder sees what the driver runs on connect (it reads the server version)...
    expect(statements).toContain('SELECT version()');
    // ...and none of it changes the schema.
    expect(statements.filter((statement) => /^\s*(CREATE|ALTER|DROP)\b/i.test(statement))).toEqual(
      [],
    );
  });

  it('boots the API as the runtime role of 01-app-roles.sh: reading and inserting rows is all it may do', async () => {
    const app = await createTestApp();
    try {
      const dataSource = app.get(DataSource);

      await expect(dataSource.query('SELECT current_user AS role')).resolves.toEqual([
        { role: currentE2eRun().app.user },
      ]);
      for (const statement of [
        'UPDATE users SET fullname = fullname',
        'DELETE FROM invoices',
        'TRUNCATE invoice_items',
      ]) {
        await expect(dataSource.query(statement)).rejects.toThrow('permission denied for table');
      }
      await expect(dataSource.query('CREATE TABLE intruder (id int)')).rejects.toThrow(
        'permission denied for schema public',
      );
    } finally {
      await app.close();
    }
  });
});

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { AppEnvironment } from './config/environment';

async function bootstrap(): Promise<void> {
  // Logs emitted while the module graph is built are buffered until the pino logger is installed. Nest's default body
  // parsers are off: configureApp registers the JSON parser only.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  configureApp(app);
  // SIGTERM (docker stop) → Nest closes the HTTP server and the database pool gracefully.
  app.enableShutdownHooks();

  const config = app.get<ConfigService<AppEnvironment, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}

bootstrap().catch((error: unknown) => {
  // The pino logger may not exist yet (e.g. invalid configuration), so report straight to stderr.
  console.error('Failed to start the API:', error);
  process.exit(1);
});

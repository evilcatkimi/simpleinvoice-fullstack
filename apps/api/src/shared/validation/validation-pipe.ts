import { ValidationPipe } from '@nestjs/common';

/** The global pipe (also used by DTO unit tests, so they validate exactly like the running API). */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    // Unknown properties are rejected, not silently dropped: a client sending `status` or `totalAmount` learns that
    // the server owns those fields.
    forbidNonWhitelisted: true,
    transform: true,
  });
}

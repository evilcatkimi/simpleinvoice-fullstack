import { z } from 'zod';

const utf8 = new TextEncoder();

/** Mirrors the API's LoginDto so obvious mistakes are caught before a (rate-limited) request. */
export const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .max(254, 'Email must be at most 254 characters')
    .pipe(z.email('Enter a valid email address')),
  // Not trimmed: spaces can be part of a password. The API counts UTF-8 bytes, as bcrypt does (72
  // ASCII characters, fewer with accents or emoji), and rejects NUL, where bcrypt would stop reading.
  password: z
    .string()
    .min(1, 'Password is required')
    .refine(
      (password) => utf8.encode(password).length <= 72,
      'Password must be at most 72 characters (fewer with accents or emoji)',
    )
    .refine((password) => !password.includes('\u0000'), 'Password must not contain NUL characters'),
});

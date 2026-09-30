import { describe, expect, it } from 'vitest';
import { DEMO_USER } from '@/test-support/fixtures';
import { loginFormSchema } from './login-form';

/** Validation messages for a password, with a valid email. */
function passwordIssues(password: string): string[] {
  const result = loginFormSchema.safeParse({ email: DEMO_USER.email, password });
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('loginFormSchema', () => {
  it('trims and checks the email, but keeps the password exactly as typed', () => {
    const result = loginFormSchema.parse({
      email: ` ${DEMO_USER.email} `,
      password: ' pass word ',
    });

    expect(result).toEqual({ email: DEMO_USER.email, password: ' pass word ' });
    expect(loginFormSchema.safeParse({ email: 'reviewer@', password: 'x' }).success).toBe(false);
  });

  it('counts the 72-character limit in UTF-8 bytes, as the API (bcrypt) does', () => {
    expect(passwordIssues('a'.repeat(72))).toEqual([]);
    expect(passwordIssues('é'.repeat(36))).toEqual([]); // 2 bytes each: 72 bytes

    const tooLong = ['Password must be at most 72 characters (fewer with accents or emoji)'];
    expect(passwordIssues('a'.repeat(73))).toEqual(tooLong);
    expect(passwordIssues('é'.repeat(37))).toEqual(tooLong); // 37 characters, but 74 bytes
  });

  it('rejects an empty password and one containing NUL', () => {
    expect(passwordIssues('')).toEqual(['Password is required']);
    expect(passwordIssues('secret\u0000')).toEqual(['Password must not contain NUL characters']);
  });
});

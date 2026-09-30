import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../../../shared/validation/validation-pipe';
import { LoginDto } from './login.dto';

const pipe = createValidationPipe();

async function errorsFor(body: object): Promise<string[]> {
  try {
    await pipe.transform(body, { type: 'body', metatype: LoginDto });
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { message: string[] }).message;
  }
}

describe('LoginDto validation', () => {
  it('rejects a NUL byte in the password: bcrypt would ignore everything after it', async () => {
    expect(
      await errorsFor({ email: 'user@example.com', password: 'correct-password\u0000anything' }),
    ).toEqual(['password must not contain NUL characters']);
  });

  it('accepts any other character a password manager may produce', async () => {
    expect(
      await errorsFor({ email: 'user@example.com', password: 'tab\there é€ 🔑 "quoted"' }),
    ).toEqual([]);
  });
});

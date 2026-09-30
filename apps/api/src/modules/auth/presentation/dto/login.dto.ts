import { ApiProperty } from '@nestjs/swagger';
import { IsByteLength, IsEmail, IsString, MaxLength, NotContains } from 'class-validator';
import { ToLowerCase } from '../../../../shared/validation/transforms';

// No credential examples: the OpenAPI document is public, and a working example would pre-fill Swagger UI's login.
export class LoginDto {
  @ApiProperty({ example: 'user@example.com', maxLength: 254 })
  @ToLowerCase()
  @IsEmail()
  @MaxLength(254)
  email: string;

  // bcrypt only uses the first 72 bytes: longer inputs would silently collide with their 72-byte prefix. The cap is
  // in bytes (UTF-8), not characters, and it also bounds the hashing work a single request can trigger. bcrypt also
  // stops at a NUL byte, so "password\u0000anything" would be accepted as "password".
  @ApiProperty({ minLength: 1, maxLength: 72, format: 'password' })
  @IsString()
  @IsByteLength(1, 72, { message: 'password must be between 1 and 72 bytes long' })
  @NotContains('\u0000', { message: 'password must not contain NUL characters' })
  password: string;
}

import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ format: 'uuid', example: 'ad1e0902-1928-4345-b513-60c86c94fc91' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'Demo Reviewer' })
  fullname: string;
}

export class LoginResponseDto {
  @ApiProperty({
    description:
      'HS256 JWT, also set as the HttpOnly session cookie (si_access_token; __Host-si_access_token when COOKIE_SECURE=true)',
  })
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ example: 3600, description: 'Token lifetime in seconds' })
  expiresIn: number;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}

export class ProfileDto extends AuthUserDto {
  @ApiProperty({ format: 'date-time', example: '2026-06-03T12:03:26.995Z' })
  createdAt: string;
}

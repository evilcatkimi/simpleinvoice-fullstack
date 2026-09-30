import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { Public } from '../../../shared/decorators/public.decorator';
import { ApiAuth, ApiErrorResponses } from '../../../shared/swagger/api-docs.decorators';
import { LoginThrottle } from '../../../shared/throttling/throttling';
import type { User } from '../../users/domain/user';
import { AuthService } from '../application/auth.service';
import { AccessTokenCookie } from '../infrastructure/access-token-cookie';
import { AccessTokenVerifier } from '../infrastructure/access-token-verifier';
import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  CsrfHeaderGuard,
} from '../infrastructure/csrf-header.guard';
import { AuthUserDto, LoginResponseDto, ProfileDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accessTokens: AccessTokenVerifier,
    private readonly cookie: AccessTokenCookie,
  ) {}

  @Public()
  @LoginThrottle()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate with e-mail and password',
    description:
      'Returns a JWT and also sets it as an HttpOnly, SameSite=Strict cookie. Rate-limited per client IP and per ' +
      'account (failed attempts); both limits answer 429 with a retry delay.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiErrorResponses(400, 401, 415, 429)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const { accessToken, expiresIn, user } = await this.authService.login(dto.email, dto.password);
    response.cookie(this.cookie.name, accessToken, {
      ...this.cookie.options,
      maxAge: expiresIn * 1000,
    });
    return { accessToken, tokenType: 'Bearer', expiresIn, user: toAuthUserDto(user) };
  }

  @Get('me')
  @ApiAuth()
  @ApiOperation({ summary: 'Profile of the authenticated user' })
  @ApiOkResponse({ type: ProfileDto })
  async me(@CurrentUser() currentUser: AuthenticatedUser): Promise<ProfileDto> {
    const user = await this.authService.getProfile(currentUser.id);
    return { ...toAuthUserDto(user), createdAt: user.createdAt.toISOString() };
  }

  /**
   * Public and idempotent: without a (valid) session it only clears the cookie. The presented token — cookie or Bearer
   * header — is revoked, so a copy captured before logout stops working as well.
   */
  @Public()
  @UseGuards(CsrfHeaderGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'End the session: revoke the presented token and clear the cookie',
    description: `Requires ${CSRF_HEADER}: ${CSRF_HEADER_VALUE} (CSRF protection), with or without a session.`,
  })
  @ApiHeader({
    name: CSRF_HEADER,
    required: true,
    schema: { type: 'string', enum: [CSRF_HEADER_VALUE], default: CSRF_HEADER_VALUE },
  })
  @ApiNoContentResponse({ description: 'Token revoked (if one was presented) and cookie cleared' })
  @ApiErrorResponses(403)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const presented = this.accessTokens.extract(request);
    const token = presented && (await this.accessTokens.verify(presented.token));
    if (token) {
      await this.authService.logout(token);
    }
    response.clearCookie(this.cookie.name, this.cookie.options);
  }
}

function toAuthUserDto({ id, email, fullname }: User): AuthUserDto {
  return { id, email, fullname };
}

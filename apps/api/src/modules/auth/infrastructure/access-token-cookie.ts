import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';
import type { AppEnvironment } from '../../../config/environment';

/**
 * The session cookie, derived from COOKIE_SECURE in this one place: login sets it, logout clears it, the token lookup
 * reads it and the OpenAPI document names it, and all four must agree.
 */
@Injectable()
export class AccessTokenCookie {
  /**
   * With the __Host- prefix, browsers only accept the cookie when it is Secure, has Path=/ and no Domain: a sibling
   * subdomain or a plain-HTTP response can then neither plant nor overwrite the session. The prefix requires Secure,
   * which plain http://localhost cannot rely on in every browser, hence the unprefixed name when COOKIE_SECURE=false.
   */
  readonly name: string;

  /**
   * HttpOnly: unreadable from JavaScript, so an XSS bug cannot exfiltrate the token.
   * SameSite=Strict: never sent on cross-site requests (first line of CSRF defence).
   * The same attributes must be used to clear the cookie, or browsers keep the original one.
   */
  readonly options: Readonly<CookieOptions>;

  constructor(config: ConfigService<AppEnvironment, true>) {
    const secure = config.get('COOKIE_SECURE', { infer: true });
    this.name = secure ? '__Host-si_access_token' : 'si_access_token';
    this.options = { httpOnly: true, sameSite: 'strict', secure, path: '/' };
  }
}

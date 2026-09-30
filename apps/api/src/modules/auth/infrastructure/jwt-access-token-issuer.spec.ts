import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppEnvironment } from '../../../config/environment';
import { JwtAccessTokenIssuer } from './jwt-access-token-issuer';
import { buildJwtOptions } from './jwt-options';

const LIFETIME_SECONDS = 900;

describe('JwtAccessTokenIssuer', () => {
  const jwtService = new JwtService(
    buildJwtOptions({
      secret: '3f9a1c7e5b2d8f4a6c0e9b1d7a3f5c8e',
      expiresIn: LIFETIME_SECONDS,
      issuer: 'simple-invoice-api',
      audience: 'simple-invoice-web',
    }),
  );
  const config = {
    get: (key: keyof AppEnvironment) => key === 'JWT_EXPIRES_IN' && LIFETIME_SECONDS,
  };
  const issuer = new JwtAccessTokenIssuer(
    jwtService,
    config as unknown as ConfigService<AppEnvironment, true>,
  );

  it('signs the claims into a token that expires after the lifetime it announces', async () => {
    const claims = {
      sub: 'ad1e0902-1928-4345-b513-60c86c94fc91',
      email: 'reviewer@simpleinvoice.dev',
      jti: '6f1c7a52-8d0e-4f3b-9a2d-1c5e7b9d3f10',
    };

    const token = await issuer.sign(claims);

    const payload = await jwtService.verifyAsync<Record<string, number | string>>(token);
    expect(payload).toMatchObject({
      ...claims,
      iss: 'simple-invoice-api',
      aud: 'simple-invoice-web',
    });
    expect(Number(payload.exp) - Number(payload.iat)).toBe(issuer.lifetimeSeconds);
    expect(issuer.lifetimeSeconds).toBe(LIFETIME_SECONDS);
  });
});

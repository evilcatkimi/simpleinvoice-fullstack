import { buildJwtOptions } from './jwt-options';

describe('buildJwtOptions', () => {
  const options = buildJwtOptions({
    secret: 'b41c9e07d3f85a26e1c04b9f7d2a638e5f0c1b8a9d47e2f36c05a1d8e9b7f423',
    expiresIn: 3600,
    issuer: 'simple-invoice-api',
    audience: 'simple-invoice-web',
  });

  it('signs HS256 tokens that expire after JWT_EXPIRES_IN, for this issuer and audience', () => {
    expect(options.signOptions).toEqual({
      algorithm: 'HS256',
      expiresIn: 3600,
      issuer: 'simple-invoice-api',
      audience: 'simple-invoice-web',
    });
  });

  it('pins the algorithm, issuer and audience on verification and caps the token age at JWT_EXPIRES_IN', () => {
    expect(options.verifyOptions).toEqual({
      algorithms: ['HS256'],
      issuer: 'simple-invoice-api',
      audience: 'simple-invoice-web',
      maxAge: 3600,
      clockTolerance: 5,
    });
  });
});

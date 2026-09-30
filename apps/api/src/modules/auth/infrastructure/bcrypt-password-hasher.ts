import * as bcrypt from 'bcrypt';
import type { PasswordHasher } from '../application/password-hasher';

/**
 * bcrypt at the configured work factor (BCRYPT_COST). Every stored hash and the login "dummy" hash must use the same
 * cost, otherwise response times would reveal whether an e-mail address exists: the API and the seed both build their
 * hasher from that one variable.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly cost: number) {}

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.cost);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}

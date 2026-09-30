import type { User, UserCredentials } from '../domain/user';

/**
 * Port through which the application reads user accounts; the TypeORM adapter lives in the infrastructure layer.
 * An abstract class (not an interface) so it can serve as the Nest injection token.
 */
export abstract class UserRepository {
  /** Case-insensitive e-mail lookup that includes the password hash (login only). */
  abstract findCredentialsByEmail(email: string): Promise<UserCredentials | null>;

  abstract findById(id: string): Promise<User | null>;
}

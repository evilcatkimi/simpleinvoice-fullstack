/** Port for one-way password hashing (bcrypt adapter in the infrastructure layer). */
export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;

  /** Must compare in constant time. */
  abstract verify(password: string, passwordHash: string): Promise<boolean>;
}

/** A user account as the application sees it: the password hash is not part of it. */
export interface User {
  id: string;
  email: string;
  fullname: string;
  createdAt: Date;
}

/** Only the login flow ever needs the hash. */
export interface UserCredentials extends User {
  passwordHash: string;
}

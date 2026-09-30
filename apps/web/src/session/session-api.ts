import { apiRequest } from '@/core/api/api-client';

export interface AuthUser {
  id: string;
  email: string;
  fullname: string;
}

interface CurrentUserResponse extends AuthUser {
  createdAt: string;
}

interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}

export interface Credentials {
  email: string;
  password: string;
}

/**
 * The login response also carries `accessToken` for Bearer clients (Swagger, curl). The SPA drops
 * it right here, so the JWT never reaches any cache: the HttpOnly cookie set by the same response
 * is its only credential, out of reach of XSS. The password travels only as the login mutation's
 * variables, which `useLogin` discards once the attempt is over.
 */
export async function login(credentials: Credentials): Promise<AuthUser> {
  const { user } = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: credentials,
    notifyUnauthorized: false,
  });
  return user;
}

export function fetchCurrentUser(signal?: AbortSignal): Promise<CurrentUserResponse> {
  return apiRequest<CurrentUserResponse>('/auth/me', { signal, notifyUnauthorized: false });
}

/** Asks the API to revoke the token and clear the HttpOnly cookie, which script cannot delete. */
export function logout(): Promise<undefined> {
  return apiRequest<undefined>('/auth/logout', { method: 'POST' });
}

/**
 * Minimal fetch wrapper for the SimpleInvoice API.
 *
 * Authentication rides exclusively on the HttpOnly `si_access_token` cookie the API sets at login.
 * The SPA never reads, stores or forwards the JWT, so even an XSS bug cannot exfiltrate it. Calls
 * are same-origin (nginx / the Vite proxy forward `/api` to the backend), so the browser attaches
 * the cookie by itself.
 */

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '');

/** `ApiError.status` used when no HTTP response was received at all (offline, DNS, CORS…). */
export const NETWORK_ERROR_STATUS = 0;

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/** The API's texts for these are written for developers (e.g. the CSRF header it expected). */
const MESSAGES_BY_STATUS = new Map([
  [403, 'This request was refused. Reload the page and try again.'],
  [413, 'The request is too large. Shorten the text and try again.'],
  [429, 'Too many attempts. Please wait a few minutes and try again.'],
]);

export class ApiError extends Error {
  readonly status: number;
  /** Messages from the API's error body; validation failures (400) usually carry several. */
  readonly messages: string[];
  /** HTTP reason phrase from the API, e.g. "Conflict". */
  readonly error: string | undefined;
  /** Correlates the failure with the API logs (`X-Request-Id`). */
  readonly requestId: string | undefined;

  constructor(
    status: number,
    messages: string[],
    details: { error?: string | undefined; requestId?: string | undefined } = {},
  ) {
    super(messages.join(' ') || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.messages = messages;
    this.error = details.error;
    this.requestId = details.requestId;
  }
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

/** Turns any thrown value into a sentence that is safe and useful to show to the user. */
export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC_ERROR_MESSAGE;
  // 5xx bodies are deliberately vague ("Internal server error"); the request id identifies the failure.
  if (error.status >= 500) return GENERIC_ERROR_MESSAGE;
  return MESSAGES_BY_STATUS.get(error.status) ?? error.message;
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | undefined;

/**
 * Registers the callback run when a protected call answers 401 (session expired or revoked).
 * Returns an unregister function so it can be used directly as a React effect cleanup.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = undefined;
  };
}

type QueryValue = string | number | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal | undefined;
  /**
   * Whether a 401 should be reported as an expired session. Disabled for calls where 401 is an
   * expected answer: a failed login attempt and the anonymous session probe.
   */
  notifyUnauthorized?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, signal, notifyUnauthorized = true } = options;

  const headers = new Headers({
    Accept: 'application/json',
    // Required by the API's CSRF defence on cookie-authenticated POSTs: a cross-site page cannot
    // attach a custom header without a CORS preflight, which the API does not grant.
    'X-Requested-With': 'XMLHttpRequest',
  });
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
      credentials: 'same-origin',
      signal: signal ?? null,
    });
  } catch (error) {
    // Cancellations (React Query aborting a stale request) must surface as such, not as outages.
    if (signal?.aborted) throw error;
    throw new ApiError(NETWORK_ERROR_STATUS, [
      'Unable to reach the server. Check your connection and try again.',
    ]);
  }

  if (!response.ok) {
    if (response.status === 401 && notifyUnauthorized) unauthorizedHandler?.();
    throw await toApiError(response);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  // Resolved against the page origin: fetch outside a browser (tests) rejects relative URLs.
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = await readJsonBody(response);
  const messages = toMessages(body?.message);
  return new ApiError(
    response.status,
    messages.length > 0 ? messages : [`Request failed with status ${response.status}`],
    {
      error: typeof body?.error === 'string' ? body.error : undefined,
      requestId:
        (typeof body?.requestId === 'string' ? body.requestId : undefined) ??
        response.headers.get('X-Request-Id') ??
        undefined,
    },
  );
}

/** The API's error body; anything in front of it (nginx 413/502 pages…) may answer with HTML instead. */
async function readJsonBody(response: Response): Promise<Record<string, unknown> | undefined> {
  if (!response.headers.get('Content-Type')?.includes('application/json')) return undefined;
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** `message` is a string, or a string[] for validation errors. */
function toMessages(message: unknown): string[] {
  const list: unknown[] = Array.isArray(message) ? message : [message];
  return list.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

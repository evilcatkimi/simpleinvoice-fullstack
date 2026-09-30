import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiResponse,
  type ApiResponseOptions,
} from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.dto';

export const BEARER_AUTH_SCHEME = 'bearer';
export const COOKIE_AUTH_SCHEME = 'cookie';

type DocumentedErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429;

const ERROR_DESCRIPTIONS: Record<DocumentedErrorStatus, string> = {
  400: 'Validation failed',
  401: 'Missing, invalid or expired access token',
  403: 'Missing X-Requested-With: XMLHttpRequest header (cookie-authenticated unsafe request, or logout)',
  404: 'Resource not found',
  409: 'Invoice number already exists',
  413: 'Request body larger than 100 kB',
  415: 'Request body that is not application/json',
  429: 'Too many requests (per client IP) or too many failed logins (per account); see Retry-After',
};

/** Every 429, whichever limit answered it. */
const RETRY_AFTER_HEADER = {
  'Retry-After': { description: 'Seconds to wait before retrying', schema: { type: 'integer' } },
};

/**
 * Every route counts against the default limit of 300 requests per minute and client IP, so configureApp adds this
 * response to every operation; a route with its own 429 description (login) replaces it.
 */
export const RATE_LIMITED_RESPONSE: ApiResponseOptions = {
  status: 429,
  description: 'Too many requests from this client IP (300 per minute); see Retry-After',
  type: ErrorResponseDto,
  headers: RETRY_AFTER_HEADER,
};

/** Documents error responses (all share the ErrorResponseDto shape). */
export const ApiErrorResponses = (...statuses: DocumentedErrorStatus[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: ERROR_DESCRIPTIONS[status],
        type: ErrorResponseDto,
        ...(status === 429 && { headers: RETRY_AFTER_HEADER }),
      }),
    ),
  );

/** Marks a route as requiring an access token (Bearer header or HttpOnly cookie). */
export const ApiAuth = () =>
  applyDecorators(
    ApiBearerAuth(BEARER_AUTH_SCHEME),
    ApiCookieAuth(COOKIE_AUTH_SCHEME),
    ApiErrorResponses(401),
  );

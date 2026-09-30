import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Opts a route out of the global JwtAuthGuard. Every other route requires authentication (secure by default). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

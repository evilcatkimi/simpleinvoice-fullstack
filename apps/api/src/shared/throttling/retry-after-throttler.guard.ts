import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * ThrottlerGuard names its Retry-After header after the throttler that blocked (`Retry-After-login` for the login
 * limit); only the `default` throttler gets the standard header. Every 429 now also carries `Retry-After` (seconds),
 * the header clients and proxies actually read, like the per-account login limit's 429.
 */
@Injectable()
export class RetryAfterThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    context: ExecutionContext,
    limitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    this.setResponseHeader(res, 'Retry-After', limitDetail.timeToBlockExpire);
    return super.throwThrottlingException(context, limitDetail);
  }
}

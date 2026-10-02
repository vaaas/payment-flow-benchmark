import type { RequestHandler } from 'express';
import type { Container } from '#src/application/dependency-injection/container';
import { Configuration } from '#src/configuration/configuration';
import { Milliseconds } from '#src/shared/domain/milliseconds';
import { HttpStatus } from '#src/shared/response/http-status';
import { HttpError } from '#src/http/errors/http-error';

export class RateLimiter {
  public static provide(container: Container): RateLimiter {
    return new RateLimiter(container.get(Configuration));
  }

  private requests = 0;
  private windowEndsAt = Milliseconds.parse(0);

  constructor(
    private readonly configuration: Configuration,
    private readonly now: () => Milliseconds = () =>
      Milliseconds.parse(performance.now()),
  ) {}

  public readonly handle: RequestHandler = (_request, response, next) => {
    const now = this.now();
    if (Milliseconds.isAtLeast(now, this.windowEndsAt)) {
      this.requests = 0;
      this.windowEndsAt = Milliseconds.plus(
        now,
        this.configuration.rateLimitWindowMs,
      );
    }
    if (this.requests >= this.configuration.rateLimitMax) {
      response.set(
        'Retry-After',
        String(Math.ceil(Milliseconds.minus(this.windowEndsAt, now) / 1000)),
      );
      next(
        new HttpError(
          HttpStatus.tooManyRequests,
          'Too many requests; retry later',
        ),
      );
      return;
    }
    this.requests++;
    next();
  };
}

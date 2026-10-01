import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Container } from '#src/application/dependency-injection/container';
import { Configuration } from '#src/configuration/configuration';
import { HttpError } from '#src/http/errors/http-error';

export class BearerAuthentication {
  public static provide(container: Container): BearerAuthentication {
    return new BearerAuthentication(container.get(Configuration));
  }

  private readonly apiKey: Buffer;

  constructor(configuration: Configuration) {
    this.apiKey = Buffer.from(configuration.apiKey);
  }

  public readonly handle: RequestHandler = (request, response, next) => {
    const authorization = request.get('Authorization');
    const token = /^Bearer (.+)$/i.exec(authorization ?? '')?.[1];
    const supplied = Buffer.from(token ?? '');
    if (
      supplied.length === this.apiKey.length &&
      timingSafeEqual(supplied, this.apiKey)
    ) {
      next();
      return;
    }
    response.set('WWW-Authenticate', 'Bearer');
    next(new HttpError(401, 'Invalid or missing bearer API key'));
  };
}

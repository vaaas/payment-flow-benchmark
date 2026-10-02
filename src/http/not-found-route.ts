import type { RequestHandler } from 'express';
import { HttpStatus } from '#src/shared/response/http-status';

export class NotFoundRoute {
  public readonly handle: RequestHandler = (_request, response) => {
    response.status(HttpStatus.notFound).json({ error: 'Route not found' });
  };
}

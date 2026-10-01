import type { RequestHandler } from 'express';

export class NotFoundRoute {
  public readonly handle: RequestHandler = (_request, response) => {
    response.status(404).json({ error: 'Route not found' });
  };
}

import type { RequestHandler } from 'express';
import openApiSpec from '../../openapi.json';

export class OpenApiRoute {
  public readonly handle: RequestHandler = (_request, response) => {
    response.json(openApiSpec);
  };
}

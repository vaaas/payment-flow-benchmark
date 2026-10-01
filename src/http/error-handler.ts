import type { ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from '#src/http/errors/http-error';
import { isRespondable } from '#src/shared/response/i-respondable';
import type { IRespondable } from '#src/shared/response/i-respondable';

export class ErrorHandler {
  public readonly handle: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    _next,
  ) => {
    const serialized = this.respondable(error).response();
    response.status(serialized.status).json(serialized.body);
  };

  private respondable(error: unknown): IRespondable {
    if (isRespondable(error)) return error;
    if (error instanceof z.ZodError) {
      return new HttpError(400, 'Invalid request', error.issues);
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      (error.type === 'entity.parse.failed' ||
        error.type === 'entity.too.large') &&
      'status' in error &&
      typeof error.status === 'number'
    ) {
      return new HttpError(error.status, 'Invalid JSON body');
    }
    console.error(error);
    return new HttpError(503, 'Processing failed; retry the identical request');
  }
}

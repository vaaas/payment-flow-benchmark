import type { ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { HttpStatus } from '#src/shared/response/http-status';
import { HttpError } from '#src/http/errors/http-error';
import { isRespondable } from '#src/shared/response/i-respondable';
import type { IRespondable } from '#src/shared/response/i-respondable';

const clientBodyErrorTypes = [
  'entity.parse.failed',
  'entity.too.large',
  'entity.verify.failed',
  'request.aborted',
  'request.size.invalid',
  'charset.unsupported',
  'encoding.unsupported',
];

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
      return new HttpError(HttpStatus.badRequest, 'Invalid request', error.issues);
    }
    if (error instanceof URIError) {
      return new HttpError(HttpStatus.badRequest, 'Invalid request');
    }
    if (this.isClientBodyError(error)) {
      return new HttpError(
        HttpStatus.parse(error.status),
        'Invalid JSON body',
      );
    }
    console.error(error);
    return new HttpError(
      HttpStatus.serviceUnavailable,
      'Processing failed; retry the identical request',
    );
  }

  private isClientBodyError(
    error: unknown,
  ): error is { status: number; type?: string; expose?: boolean } {
    if (typeof error !== 'object' || error === null) return false;
    if (!('status' in error) || typeof error.status !== 'number') return false;
    if (!HttpStatus.isClientError(error.status)) return false;
    const type = 'type' in error ? error.type : undefined;
    if (typeof type === 'string' && clientBodyErrorTypes.includes(type))
      return true;
    return 'expose' in error && error.expose === true;
  }
}

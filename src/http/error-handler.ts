import type { ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { CheckoutConflict } from '../checkout/domain/checkout-conflict';
import { OrderNotFound } from '../orders/domain/order-not-found';
import { ProviderEventConflict } from '../payments/domain/provider-event-conflict';

export class ErrorHandler {
  public readonly handle: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    if (error instanceof z.ZodError) {
      response
        .status(400)
        .json({ error: 'Invalid request', details: error.issues });
      return;
    }
    if (error instanceof OrderNotFound) {
      response.status(404).json({ error: error.message });
      return;
    }
    if (
      error instanceof CheckoutConflict ||
      error instanceof ProviderEventConflict
    ) {
      response.status(409).json({ error: error.message });
      return;
    }
    if (
      error.type === 'entity.parse.failed' ||
      error.type === 'entity.too.large'
    ) {
      response.status(error.status).json({ error: 'Invalid JSON body' });
      return;
    }
    console.error(error);
    response
      .status(503)
      .json({ error: 'Processing failed; retry the identical request' });
  };
}

import type { Container } from '#src/application/dependency-injection/container';
import type { RequestHandler } from 'express';
import { HttpStatus } from '#src/shared/response/http-status';
import { Bus } from '#src/application/bus';
import { CreateCheckout } from '#src/features/checkout/domain/create-checkout';

export class CreateCheckoutRoute {
  public static provide(container: Container): CreateCheckoutRoute {
    return new CreateCheckoutRoute(container.get(Bus));
  }

  constructor(private readonly bus: Bus) {}

  public readonly handle: RequestHandler = async (request, response) => {
    const command = CreateCheckout.from(
      request.body,
      request.get('Idempotency-Key'),
    );
    const result = await this.bus.dispatch(command);
    response
      .status(result.created ? HttpStatus.created : HttpStatus.ok)
      .json(result.order);
  };
}

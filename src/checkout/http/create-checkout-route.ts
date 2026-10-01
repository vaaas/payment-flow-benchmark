import type { RequestHandler } from 'express';
import type { Bus } from '#src/application/bus';
import { CreateCheckout } from '#src/checkout/domain/create-checkout';

export class CreateCheckoutRoute {
  constructor(private readonly bus: Bus) {}

  public readonly handle: RequestHandler = async (request, response) => {
    const command = CreateCheckout.from(request.body);
    const result = await this.bus.dispatch(command);
    response.status(result.created ? 201 : 200).json(result.order);
  };
}

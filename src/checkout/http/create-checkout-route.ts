import type { RequestHandler } from 'express';
import type { CommandBus } from '#src/application/command-bus';
import { CreateCheckout } from '#src/checkout/domain/create-checkout';

export class CreateCheckoutRoute {
  constructor(private readonly commands: CommandBus) {}

  public readonly handle: RequestHandler = async (request, response) => {
    const command = CreateCheckout.from(request.body);
    const result = await this.commands.dispatch(command);
    response.status(result.created ? 201 : 200).json(result.order);
  };
}

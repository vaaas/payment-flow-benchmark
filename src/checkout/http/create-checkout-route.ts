import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import type { CommandBus } from '../../application/command-bus';
import { requestIdentifier } from '../../http/request-identifier';
import { CreateCheckout } from '../domain/create-checkout';

export class CreateCheckoutRoute {
  private readonly bodySchema = z.strictObject({
    businessOrderReference: requestIdentifier,
    amountMinor: z
      .string()
      .regex(/^[1-9][0-9]{0,18}$/)
      .pipe(
        z.string().refine((value) => BigInt(value) <= 9223372036854775807n),
      ),
    currency: z.string().regex(/^[A-Z]{3}$/),
  });

  constructor(private readonly commands: CommandBus) {}

  public readonly handle: RequestHandler = async (request, response) => {
    const command = this.parse(request);
    const result = await this.commands.dispatch(command);
    response.status(result.created ? 201 : 200).json(result.order);
  };

  private parse(request: Request): CreateCheckout {
    return new CreateCheckout(this.bodySchema.parse(request.body));
  }
}

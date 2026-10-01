import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import type { CommandBus } from '#src/application/command-bus';
import { requestIdentifier } from '#src/http/request-identifier';
import { ReceiveWebhook } from '#src/payments/domain/receive-webhook';

export class ReceiveWebhookRoute {
  private readonly bodySchema = z.strictObject({
    eventId: requestIdentifier,
    orderId: z.uuid(),
    outcome: z.enum(['failed', 'succeeded']),
  });

  constructor(private readonly commands: CommandBus) {}

  public readonly handle: RequestHandler = async (request, response) => {
    const command = this.parse(request);
    response.json(await this.commands.dispatch(command));
  };

  private parse(request: Request): ReceiveWebhook {
    return new ReceiveWebhook(this.bodySchema.parse(request.body));
  }
}

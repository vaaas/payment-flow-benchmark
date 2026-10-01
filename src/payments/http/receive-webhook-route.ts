import type { RequestHandler } from 'express';
import type { CommandBus } from '#src/application/command-bus';
import { ReceiveWebhook } from '#src/payments/domain/receive-webhook';

export class ReceiveWebhookRoute {
  constructor(private readonly commands: CommandBus) {}

  public readonly handle: RequestHandler = async (request, response) => {
    const command = ReceiveWebhook.from(request.body);
    response.json(await this.commands.dispatch(command));
  };
}

import type { RequestHandler } from 'express';
import type { Bus } from '#src/application/bus';
import { ReceiveWebhook } from '#src/features/payments/domain/receive-webhook';

export class ReceiveWebhookRoute {
  constructor(private readonly bus: Bus) {}

  public readonly handle: RequestHandler = async (request, response) => {
    const command = ReceiveWebhook.from(request.body);
    response.json(await this.bus.dispatch(command));
  };
}

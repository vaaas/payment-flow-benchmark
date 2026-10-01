import type { Container } from '#src/application/dependency-injection/container';
import type { RequestHandler } from 'express';
import { Bus } from '#src/application/bus';
import { ReceiveWebhook } from '#src/features/payments/domain/receive-webhook';

export class ReceiveWebhookRoute {
  public static provide(container: Container): ReceiveWebhookRoute {
    return new ReceiveWebhookRoute(container.get(Bus));
  }

  constructor(private readonly bus: Bus) {}

  public readonly handle: RequestHandler = async (request, response) => {
    const command = ReceiveWebhook.from(request.body);
    response.json(await this.bus.dispatch(command));
  };
}

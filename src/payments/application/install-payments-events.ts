import type { Bus } from '#src/application/bus';
import type { Container } from '#src/application/dependency-injection/container';
import type { Installer } from '#src/application/installer';
import { ReceiveWebhook } from '#src/payments/domain/receive-webhook';
import { ReceiveWebhookHandler } from '#src/payments/application/receive-webhook-handler';

export function installPaymentsEvents(container: Container): Installer<Bus> {
  return (bus) => bus.on(ReceiveWebhook, container.get(ReceiveWebhookHandler));
}

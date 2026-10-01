import type { App } from '#src/http/app';
import { Bus } from '#src/application/bus';
import { ReceiveWebhookHandler } from '#src/features/payments/application/receive-webhook-handler';
import { installPaymentsEvents } from '#src/features/payments/application/install-payments-events';
import { ReceiveWebhookRoute } from '#src/features/payments/http/receive-webhook-route';

export function installPaymentsFeature(app: App): App {
  const container = app.container
    .register(ReceiveWebhookHandler, ReceiveWebhookHandler)
    .register(ReceiveWebhookRoute, ReceiveWebhookRoute);
  container.get(Bus).install(installPaymentsEvents(container));
  app.routes.post(
    '/webhooks/payment',
    container.get(ReceiveWebhookRoute).handle,
  );
  return app;
}

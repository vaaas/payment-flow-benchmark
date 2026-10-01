import { BearerAuthentication } from '#src/http/authentication/bearer-authentication';
import type { App } from '#src/http/app';
import { Bus } from '#src/application/bus';
import { CreateCheckoutHandler } from '#src/features/checkout/application/create-checkout-handler';
import { installCheckoutEvents } from '#src/features/checkout/application/install-checkout-events';
import { CreateCheckoutRoute } from '#src/features/checkout/http/create-checkout-route';

export function installCheckoutFeature(app: App): App {
  const container = app.container
    .register(CreateCheckoutHandler, CreateCheckoutHandler)
    .register(CreateCheckoutRoute, CreateCheckoutRoute);
  container.get(Bus).install(installCheckoutEvents(container));
  app.routes.post(
    '/checkout-intents',
    container.get(BearerAuthentication).handle,
    container.get(CreateCheckoutRoute).handle,
  );
  return app;
}

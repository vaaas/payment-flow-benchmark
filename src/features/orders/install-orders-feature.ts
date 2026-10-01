import type { App } from '#src/http/app';
import { Bus } from '#src/application/bus';
import { GetOrderHandler } from '#src/features/orders/application/get-order-handler';
import { installOrdersEvents } from '#src/features/orders/application/install-orders-events';
import { GetOrderRoute } from '#src/features/orders/http/get-order-route';

export function installOrdersFeature(app: App): App {
  const container = app.container
    .register(GetOrderHandler, GetOrderHandler)
    .register(GetOrderRoute, GetOrderRoute);
  container.get(Bus).install(installOrdersEvents(container));
  app.routes.get('/orders/:id', container.get(GetOrderRoute).handle);
  return app;
}

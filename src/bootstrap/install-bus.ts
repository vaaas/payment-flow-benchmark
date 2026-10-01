import { Bus } from '#src/application/bus';
import type { Container } from '#src/application/dependency-injection/container';
import { installCheckoutEvents } from '#src/checkout/application/install-checkout-events';
import { installPaymentsEvents } from '#src/payments/application/install-payments-events';
import { installOrdersEvents } from '#src/orders/application/install-orders-events';

export function installBus(container: Container): Container {
  return container.register(Bus, {
    provide: (dependencies) =>
      new Bus()
        .install(installCheckoutEvents(dependencies))
        .install(installPaymentsEvents(dependencies))
        .install(installOrdersEvents(dependencies)),
  });
}

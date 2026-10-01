import type { Bus } from '#src/application/bus';
import type { Container } from '#src/application/dependency-injection/container';
import type { Installer } from '#src/application/installer';
import { CreateCheckout } from '#src/features/checkout/domain/create-checkout';
import { CreateCheckoutHandler } from '#src/features/checkout/application/create-checkout-handler';

export function installCheckoutEvents(container: Container): Installer<Bus> {
  return (bus) => bus.on(CreateCheckout, container.get(CreateCheckoutHandler));
}

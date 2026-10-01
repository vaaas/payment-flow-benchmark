import type { Bus } from '#src/application/bus';
import type { Container } from '#src/application/dependency-injection/container';
import type { Installer } from '#src/application/installer';
import { GetOrder } from '#src/features/orders/domain/get-order';
import { GetOrderHandler } from '#src/features/orders/application/get-order-handler';

export function installOrdersEvents(container: Container): Installer<Bus> {
  return (bus) => bus.on(GetOrder, container.get(GetOrderHandler));
}

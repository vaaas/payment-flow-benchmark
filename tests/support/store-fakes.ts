import type { Container } from '#src/application/dependency-injection/container';
import { CheckoutStore } from '#src/features/checkout/domain/checkout-store';
import type { Order } from '#src/features/orders/domain/order';
import { OrderReader } from '#src/features/orders/domain/order-reader';
import { PaymentStore } from '#src/features/payments/domain/payment-store';

export function createStoreFakes() {
  const checkout = {
    transaction: jest.fn<
      Promise<any>,
      [work: (session: any) => Promise<any>]
    >(),
  };
  const payments = {
    transaction: jest.fn<
      Promise<any>,
      [work: (session: any) => Promise<any>]
    >(),
  };
  const orders = { find: jest.fn<Promise<Order | undefined>, [id: string]>() };
  return {
    checkout,
    payments,
    orders,
    install: (container: Container): Container =>
      container
        .registerInstance(CheckoutStore, checkout)
        .registerInstance(PaymentStore, payments)
        .registerInstance(OrderReader, orders),
  };
}

export type StoreFakes = ReturnType<typeof createStoreFakes>;

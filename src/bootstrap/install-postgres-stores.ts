import type { Container } from '#src/application/dependency-injection/container';
import { CheckoutStore } from '#src/features/checkout/domain/checkout-store';
import { PostgresCheckoutStore } from '#src/features/checkout/infrastructure/postgres-checkout-store';
import { OrderReader } from '#src/features/orders/domain/order-reader';
import { PostgresOrderReader } from '#src/features/orders/infrastructure/postgres-order-reader';
import { PaymentStore } from '#src/features/payments/domain/payment-store';
import { PostgresPaymentStore } from '#src/features/payments/infrastructure/postgres-payment-store';

export function installPostgresStores(container: Container): Container {
  return container
    .register(CheckoutStore, PostgresCheckoutStore)
    .register(PaymentStore, PostgresPaymentStore)
    .register(OrderReader, PostgresOrderReader);
}

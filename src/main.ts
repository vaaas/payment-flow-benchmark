import { Container } from '#src/application/dependency-injection/container';
import { OrderStore } from '#src/orders/domain/order-store';
import { CreateCheckout } from '#src/checkout/domain/create-checkout';
import { ReceiveWebhook } from '#src/payments/domain/receive-webhook';
import { GetOrder } from '#src/orders/domain/get-order';
import { Pool } from 'pg';
import { Configuration } from '#src/configuration/configuration';
import { App } from '#src/http/app';
import { Bus } from '#src/application/bus';
import { CreateCheckoutHandler } from '#src/checkout/application/create-checkout-handler';
import { ReceiveWebhookHandler } from '#src/payments/application/receive-webhook-handler';
import { GetOrderHandler } from '#src/orders/application/get-order-handler';
import { PostgresOrderStore } from '#src/infrastructure/postgres/postgres-order-store';

const container = new Container()
  .register(Pool, {
    provide: (dependencies) =>
      new Pool({
        connectionString: dependencies.get(Configuration).databaseUrl,
        max: 10,
      }),
  })
  .register(OrderStore, PostgresOrderStore)
  .register(Bus, {
    provide: (dependencies) =>
      new Bus()
        .on(CreateCheckout, dependencies.get(CreateCheckoutHandler))
        .on(ReceiveWebhook, dependencies.get(ReceiveWebhookHandler))
        .on(GetOrder, dependencies.get(GetOrderHandler)),
  });
const server = container.get(App).listen(3000, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => {
      void container.get(Pool).end();
    });
  });

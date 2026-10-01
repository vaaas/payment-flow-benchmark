import { CreateCheckout } from '#src/checkout/domain/create-checkout';
import { ReceiveWebhook } from '#src/payments/domain/receive-webhook';
import { GetOrder } from '#src/orders/domain/get-order';
import { Pool } from 'pg';
import { Configuration } from '#src/configuration/configuration';
import { drizzle } from 'drizzle-orm/node-postgres';
import { App } from '#src/http/app';
import { Bus } from '#src/application/bus';
import { CreateCheckoutHandler } from '#src/checkout/application/create-checkout-handler';
import { ReceiveWebhookHandler } from '#src/payments/application/receive-webhook-handler';
import { GetOrderHandler } from '#src/orders/application/get-order-handler';
import { PostgresOrderStore } from '#src/infrastructure/postgres/postgres-order-store';
const configuration = Configuration.fromEnv();
const pool = new Pool({ connectionString: configuration.databaseUrl, max: 10 });
const store = new PostgresOrderStore(drizzle(pool));
const bus = new Bus()
  .on(CreateCheckout, new CreateCheckoutHandler(store))
  .on(ReceiveWebhook, new ReceiveWebhookHandler(store))
  .on(GetOrder, new GetOrderHandler(store));
const server = new App(bus).listen(3000, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => {
      void pool.end();
    });
  });

import { installBus } from '#src/bootstrap/install-bus';
import { Container } from '#src/application/dependency-injection/container';
import { OrderStore } from '#src/orders/domain/order-store';
import { Pool } from 'pg';
import { Configuration } from '#src/configuration/configuration';
import { App } from '#src/http/app';
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
  .install(installBus);
const server = container.get(App).listen(3000, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => {
      void container.get(Pool).end();
    });
  });

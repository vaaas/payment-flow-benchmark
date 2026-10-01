import { installFeatures } from '#src/bootstrap/install-features';
import { Container } from '#src/application/dependency-injection/container';
import { OrderStore } from '#src/features/orders/domain/order-store';
import { Database } from '#src/infrastructure/postgres/database';
import { App } from '#src/http/app';
import { PostgresOrderStore } from '#src/infrastructure/postgres/postgres-order-store';

const container = new Container().register(OrderStore, PostgresOrderStore);
const server = container
  .get(App)
  .install(installFeatures)
  .listen(3000, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => {
      void container
        .get(Database)
        .close()
        .catch((error: unknown) =>
          console.error('Database shutdown failed', error),
        );
    });
  });

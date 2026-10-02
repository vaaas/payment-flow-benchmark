import { installFeatures } from '#src/bootstrap/install-features';
import { installPostgresStores } from '#src/bootstrap/install-postgres-stores';
import { Container } from '#src/application/dependency-injection/container';
import { Database } from '#src/infrastructure/postgres/database';
import { App } from '#src/http/app';

const container = new Container().install(installPostgresStores);
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

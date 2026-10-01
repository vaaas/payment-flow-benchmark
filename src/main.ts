import { Pool } from 'pg';
import { Configuration } from '#src/configuration/configuration';
import { drizzle } from 'drizzle-orm/node-postgres';
import { App } from '#src/http/app';
import { CommandBus } from '#src/application/command-bus';
import { QueryBus } from '#src/application/query-bus';
import { PostgresOrderStore } from '#src/infrastructure/postgres/postgres-order-store';
const configuration = Configuration.fromEnv();
const pool = new Pool({ connectionString: configuration.databaseUrl, max: 10 });
const store = new PostgresOrderStore(drizzle(pool));
const server = new App(new CommandBus(store), new QueryBus(store)).listen(
  3000,
  '0.0.0.0',
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => {
      void pool.end();
    });
  });

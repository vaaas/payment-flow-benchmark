import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { App } from './http/app';
import { CommandBus } from './application/command-bus';
import { QueryBus } from './application/query-bus';
import { PostgresOrderStore } from './infrastructure/postgres/postgres-order-store';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
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

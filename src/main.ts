import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createApp } from './app';
import { CommandBus, QueryBus } from './domain';
import { PostgresOrderStore } from './store';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const store = new PostgresOrderStore(drizzle(pool));
const server = createApp(new CommandBus(store), new QueryBus(store)).listen(3000, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => { void pool.end(); });
});

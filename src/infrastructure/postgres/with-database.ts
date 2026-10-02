import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Database } from '#src/infrastructure/postgres/database';

export type PostgresTransaction = Parameters<
  Parameters<NodePgDatabase['transaction']>[0]
>[0];

export async function withDatabase<T>(
  database: Database,
  operation: (db: NodePgDatabase) => Promise<T>,
): Promise<T> {
  const client = await database.connect();
  try {
    return await operation(drizzle(client));
  } finally {
    client.release();
  }
}

export function withTransaction<T>(
  database: Database,
  work: (transaction: PostgresTransaction) => Promise<T>,
): Promise<T> {
  return withDatabase(database, (db) => db.transaction(work));
}

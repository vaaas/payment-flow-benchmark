import { eq } from 'drizzle-orm';
import type { Container } from '#src/application/dependency-injection/container';
import type { Order } from '#src/features/orders/domain/order';
import type { OrderReader } from '#src/features/orders/domain/order-reader';
import { toOrder } from '#src/features/orders/infrastructure/order-mapper';
import { Database } from '#src/infrastructure/postgres/database';
import { orders } from '#src/infrastructure/postgres/schema';
import { withDatabase } from '#src/infrastructure/postgres/with-database';

export class PostgresOrderReader implements OrderReader {
  public static provide(container: Container): PostgresOrderReader {
    return new PostgresOrderReader(container.get(Database));
  }

  constructor(private readonly database: Database) {}

  public find(id: string): Promise<Order | undefined> {
    return withDatabase(this.database, async (db) => {
      const [row] = await db
        .select()
        .from(orders)
        .where(eq(orders.publicId, id));
      return row && toOrder(row);
    });
  }
}

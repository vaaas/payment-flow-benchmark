import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { Pool } from 'pg';
import { Container } from '#src/application/dependency-injection/container';
import { installFeatures } from '#src/bootstrap/install-features';
import { Configuration } from '#src/configuration/configuration';
import { OrderStore } from '#src/features/orders/domain/order-store';
import { App } from '#src/http/app';
import { RateLimiter } from '#src/http/rate-limiting/rate-limiter';
import { Database } from '#src/infrastructure/postgres/database';
import { migrate } from '#src/infrastructure/postgres/migrate';
import { PostgresOrderStore } from '#src/infrastructure/postgres/postgres-order-store';

export const validCheckout = {
  businessOrderReference: 'merchant-123',
  amountMinor: '1999',
  currency: 'EUR',
};

export type FixtureOptions = Readonly<{
  apiKey?: string;
  schema?: string;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  now?: () => number;
}>;

export type StoredTable =
  'orders' | 'provider_events' | 'checkout_idempotency_keys';

export function createFixture(options: FixtureOptions = {}) {
  const environment = Configuration.fromEnv();
  const scopedUrl = new URL(environment.databaseUrl);
  if (options.schema)
    scopedUrl.searchParams.set('options', `-c search_path=${options.schema}`);
  const configuration = Configuration.fromEnv({
    DATABASE_URL: scopedUrl.toString(),
    API_KEY: options.apiKey ?? environment.apiKey,
    RATE_LIMIT_MAX: String(options.rateLimitMax ?? 100000),
    RATE_LIMIT_WINDOW_MS: String(options.rateLimitWindowMs ?? 60000),
  });
  const container = new Container()
    .registerInstance(Configuration, configuration)
    .registerInstance(RateLimiter, new RateLimiter(configuration, options.now))
    .register(OrderStore, PostgresOrderStore);
  const app = container.get(App).install(installFeatures).http;
  const database = container.get(Database);
  const pool = new Pool({
    connectionString: configuration.databaseUrl,
    max: 5,
  });
  const administration = new Pool({
    connectionString: environment.databaseUrl,
    max: 1,
  });
  const authorization = `Bearer ${configuration.apiKey}`;
  let closing: Promise<void> | undefined;

  const truncate = () =>
    pool.query('TRUNCATE checkout_idempotency_keys, provider_events, orders');
  const checkout = (body: object = validCheckout) =>
    request(app)
      .post('/checkout-intents')
      .set('Authorization', authorization)
      .send(body);
  const webhook = (orderId: string, eventId: string, outcome = 'succeeded') =>
    request(app).post('/webhooks/payment').send({ orderId, eventId, outcome });
  const order = (id: string) =>
    request(app).get(`/orders/${id}`).set('Authorization', authorization);

  return {
    app,
    configuration,
    authorization,
    pool,
    checkout,
    webhook,
    order,
    prepare: async () => {
      if (new URL(environment.databaseUrl).pathname !== '/checkout_test')
        throw new Error('Tests require the dedicated checkout_test database');
      if (options.schema) {
        await administration.query(
          `DROP SCHEMA IF EXISTS ${options.schema} CASCADE`,
        );
        await administration.query(`CREATE SCHEMA ${options.schema}`);
      }
      await migrate(pool);
      await truncate();
    },
    reset: async () => {
      await truncate();
    },
    close: () => {
      closing ??= (async () => {
        await database.close();
        await pool.end();
        if (options.schema)
          await administration.query(
            `DROP SCHEMA IF EXISTS ${options.schema} CASCADE`,
          );
        await administration.end();
      })();
      return closing;
    },
    serve: async () => {
      const server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const { port } = server.address() as AddressInfo;
      return {
        url: `http://127.0.0.1:${port}`,
        stop: () =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeAllConnections();
          }),
      };
    },
    place: async (businessOrderReference = 'merchant-123') => {
      const response = await checkout({
        ...validCheckout,
        businessOrderReference,
      });
      if (response.status !== 201)
        throw new Error(`Expected a new order but received ${response.status}`);
      return response.body as {
        id: string;
        businessOrderReference: string;
        amountMinor: string;
        currency: string;
        status: string;
        createdAt: string;
        updatedAt: string;
      };
    },
    count: async (table: StoredTable) => {
      const result = await pool.query(
        `SELECT count(*)::int AS total FROM ${table}`,
      );
      return result.rows[0].total as number;
    },
  };
}

export type Fixture = ReturnType<typeof createFixture>;

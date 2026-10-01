import { Pool } from 'pg';
import type { PoolClient, PoolConfig } from 'pg';
import type { Container } from '#src/application/dependency-injection/container';
import { Configuration } from '#src/configuration/configuration';
import { DatabaseUnavailable } from '#src/infrastructure/postgres/database-unavailable';

export class Database {
  public static provide(container: Container): Database {
    return new Database(container.get(Configuration));
  }

  private pool: Pool | undefined;
  private initializing: Promise<Pool> | undefined;
  private closing: Promise<void> | undefined;
  private closed = false;

  constructor(
    private readonly configuration: Configuration,
    private readonly createPool: (options: PoolConfig) => Pool = (options) =>
      new Pool(options),
  ) {}

  public async connect(): Promise<PoolClient> {
    try {
      const pool = await this.initialize();
      return await pool.connect();
    } catch (error) {
      console.error('PostgreSQL connection failed', error);
      throw new DatabaseUnavailable();
    }
  }

  public close(): Promise<void> {
    this.closed = true;
    this.closing ??= this.dispose();
    return this.closing;
  }

  private async dispose(): Promise<void> {
    await this.initializing?.catch(() => undefined);
    const pool = this.pool;
    this.pool = undefined;
    await pool?.end();
  }

  private async initialize(): Promise<Pool> {
    if (this.closed) throw new DatabaseUnavailable();
    if (this.pool) return this.pool;
    if (this.initializing) return this.initializing;
    const initializing = this.open();
    this.initializing = initializing;
    try {
      return await initializing;
    } finally {
      this.initializing = undefined;
    }
  }

  private async open(): Promise<Pool> {
    const pool = this.createPool({
      connectionString: this.configuration.databaseUrl,
      max: 10,
      connectionTimeoutMillis: 2000,
    });
    pool.on('error', (error: Error) =>
      console.error('PostgreSQL idle connection failed', error),
    );
    pool.on('connect', (client: PoolClient) => {
      client.on('error', (error: Error) =>
        console.error('PostgreSQL client connection failed', error),
      );
    });
    try {
      const client = await pool.connect();
      client.release();
      if (this.closed) throw new DatabaseUnavailable();
      this.pool = pool;
      return pool;
    } catch (error) {
      await pool.end();
      throw error;
    }
  }
}

import type { Container } from '#src/application/dependency-injection/container';
import { z } from 'zod';
import { ApiKey } from '#src/configuration/api-key';
import { DatabaseUrl } from '#src/configuration/database-url';
import { RequestLimit } from '#src/configuration/request-limit';
import { Milliseconds } from '#src/shared/domain/milliseconds';

const positiveInteger = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .transform(Number);

export class Configuration {
  public static provide(_container: Container): Configuration {
    return Configuration.fromEnv();
  }

  private static readonly schema = z.object({
    RATE_LIMIT_MAX: positiveInteger
      .pipe(RequestLimit.schema)
      .default(RequestLimit.parse(100)),
    RATE_LIMIT_WINDOW_MS: positiveInteger
      .pipe(Milliseconds.schema)
      .default(Milliseconds.parse(60000)),
    API_KEY: ApiKey.schema.default(ApiKey.parse('benchmark-api-key')),
    DATABASE_URL: DatabaseUrl.schema,
  });

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): Configuration {
    const parsed = Configuration.schema.parse(env);
    return new Configuration(
      parsed.DATABASE_URL,
      parsed.API_KEY,
      parsed.RATE_LIMIT_MAX,
      parsed.RATE_LIMIT_WINDOW_MS,
    );
  }

  private constructor(
    public readonly databaseUrl: DatabaseUrl,
    public readonly apiKey: ApiKey,
    public readonly rateLimitMax: RequestLimit,
    public readonly rateLimitWindowMs: Milliseconds,
  ) {
    Object.freeze(this);
  }
}

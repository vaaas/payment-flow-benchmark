import type { Container } from '#src/application/dependency-injection/container';
import { z } from 'zod';

export class Configuration {
  public static provide(_container: Container): Configuration {
    return Configuration.fromEnv();
  }

  private static readonly schema = z.object({
    API_KEY: z.string().regex(/^\S+$/).default('benchmark-api-key'),
    DATABASE_URL: z
      .string()
      .url()
      .pipe(
        z.string().refine((value) => {
          const protocol = new URL(value).protocol;
          return protocol === 'postgres:' || protocol === 'postgresql:';
        }, 'DATABASE_URL must use a PostgreSQL URL'),
      ),
  });

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): Configuration {
    const parsed = Configuration.schema.parse(env);
    return new Configuration(parsed.DATABASE_URL, parsed.API_KEY);
  }

  private constructor(
    public readonly databaseUrl: string,
    public readonly apiKey: string,
  ) {
    Object.freeze(this);
  }
}

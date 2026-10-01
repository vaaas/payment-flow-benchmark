import { Configuration } from '#src/configuration/configuration';

const databaseUrl = 'postgresql://postgres:benchmark@database:5432/checkout';

test('Configuration parses an injected environment into an immutable snapshot', () => {
  const env = { DATABASE_URL: databaseUrl };
  const configuration = Configuration.fromEnv(env);
  env.DATABASE_URL = 'postgresql://other:other@database:5432/other';
  expect(configuration.databaseUrl).toBe(databaseUrl);
  expect(configuration.apiKey).toBe('benchmark-api-key');
  expect(configuration.rateLimitMax).toBe(100);
  expect(configuration.rateLimitWindowMs).toBe(60000);
  expect(Object.isFrozen(configuration)).toBe(true);
});

test.each([
  {},
  { DATABASE_URL: 'invalid' },
  { DATABASE_URL: 'https://example.com/checkout' },
  { DATABASE_URL: databaseUrl, API_KEY: '' },
  { DATABASE_URL: databaseUrl, API_KEY: 'invalid key' },
  { DATABASE_URL: databaseUrl, RATE_LIMIT_MAX: '0' },
  { DATABASE_URL: databaseUrl, RATE_LIMIT_MAX: '1.5' },
  { DATABASE_URL: databaseUrl, RATE_LIMIT_MAX: 'invalid' },
  { DATABASE_URL: databaseUrl, RATE_LIMIT_MAX: '9007199254740992' },
  { DATABASE_URL: databaseUrl, RATE_LIMIT_WINDOW_MS: '-1' },
])('Configuration rejects an invalid environment: %j', (env) => {
  expect(() => Configuration.fromEnv(env)).toThrow();
});

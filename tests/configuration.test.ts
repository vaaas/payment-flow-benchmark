import { Configuration } from '#src/configuration/configuration';

const databaseUrl = 'postgresql://postgres:benchmark@database:5432/checkout';

test('Configuration parses an injected environment into an immutable snapshot', () => {
  const env = { DATABASE_URL: databaseUrl };
  const configuration = Configuration.fromEnv(env);
  env.DATABASE_URL = 'postgresql://other:other@database:5432/other';
  expect(configuration.databaseUrl).toBe(databaseUrl);
  expect(Object.isFrozen(configuration)).toBe(true);
});

test.each([
  {},
  { DATABASE_URL: 'invalid' },
  { DATABASE_URL: 'https://example.com/checkout' },
])('Configuration rejects an invalid environment: %j', (env) => {
  expect(() => Configuration.fromEnv(env)).toThrow();
});

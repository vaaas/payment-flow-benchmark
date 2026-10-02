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

test.each(['postgres://', 'postgresql://'])(
  'Configuration accepts the %s scheme',
  (scheme) => {
    const url = `${scheme}user:secret@host:5432/db`;
    expect(Configuration.fromEnv({ DATABASE_URL: url }).databaseUrl).toBe(url);
  },
);

test.each([
  'mysql://user:secret@host:3306/db',
  'redis://host:6379',
  'file:///var/lib/postgresql',
  'http://host/db',
  'postgres',
  '//host/db',
])('Configuration rejects the non-PostgreSQL URL %s', (url) => {
  expect(() => Configuration.fromEnv({ DATABASE_URL: url })).toThrow();
});

test('Configuration applies operator overrides', () => {
  const configuration = Configuration.fromEnv({
    DATABASE_URL: databaseUrl,
    API_KEY: 'operator-key',
    RATE_LIMIT_MAX: '1',
    RATE_LIMIT_WINDOW_MS: '250',
  });
  expect(configuration.apiKey).toBe('operator-key');
  expect(configuration.rateLimitMax).toBe(1);
  expect(configuration.rateLimitWindowMs).toBe(250);
});

test('Configuration ignores unrelated environment variables', () => {
  const configuration = Configuration.fromEnv({
    DATABASE_URL: databaseUrl,
    PATH: '/usr/bin',
    NODE_ENV: 'production',
    API_PORT: 'not-a-number',
  });
  expect(configuration.databaseUrl).toBe(databaseUrl);
});

test.each([' 5', '5 ', '+5', '-5', '1e3', '0x10', '', '00', '007', 'Infinity'])(
  'Configuration rejects the malformed number %j for both limits',
  (value) => {
    expect(() =>
      Configuration.fromEnv({
        DATABASE_URL: databaseUrl,
        RATE_LIMIT_MAX: value,
      }),
    ).toThrow();
    expect(() =>
      Configuration.fromEnv({
        DATABASE_URL: databaseUrl,
        RATE_LIMIT_WINDOW_MS: value,
      }),
    ).toThrow();
  },
);

test.each(['key with space', 'tab\tkey', 'new\nline', ' leading', 'trailing '])(
  'Configuration rejects the API key %j',
  (apiKey) => {
    expect(() =>
      Configuration.fromEnv({ DATABASE_URL: databaseUrl, API_KEY: apiKey }),
    ).toThrow();
  },
);

test('Configuration accepts long and symbol-heavy API keys', () => {
  const apiKey = `k${'x'.repeat(500)}!@#$%^&*()_+-=[]{};:'",.<>/?|~`;
  expect(
    Configuration.fromEnv({ DATABASE_URL: databaseUrl, API_KEY: apiKey })
      .apiKey,
  ).toBe(apiKey);
});

test('Configuration reports every invalid setting at once without echoing secrets', () => {
  const message = (() => {
    try {
      Configuration.fromEnv({
        DATABASE_URL: 'invalid://user:hunter2@',
        API_KEY: 'bad key',
        RATE_LIMIT_MAX: '0',
        RATE_LIMIT_WINDOW_MS: 'x',
      });
    } catch (error) {
      return String(error instanceof Error ? error.message : error);
    }
    throw new Error('Expected configuration to be rejected');
  })();
  for (const name of [
    'DATABASE_URL',
    'API_KEY',
    'RATE_LIMIT_MAX',
    'RATE_LIMIT_WINDOW_MS',
  ])
    expect(message).toContain(name);
  expect(message).not.toContain('hunter2');
  expect(message).not.toContain('bad key');
});

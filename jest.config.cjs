module.exports = {
  preset: 'ts-jest',
  moduleNameMapper: {
    '^#src/(.*)$': '<rootDir>/src/$1',
    '^#openapi$': '<rootDir>/openapi.json',
    '^#tests/(.*)$': '<rootDir>/tests/$1',
  },
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  testTimeout: 30000,
};

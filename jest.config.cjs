module.exports = {
  preset: 'ts-jest',
  moduleNameMapper: {
    '^#src/(.*)$': '<rootDir>/src/$1',
    '^#openapi$': '<rootDir>/openapi.json',
  },
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  testTimeout: 30000,
};

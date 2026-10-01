const typescriptParser = require('@typescript-eslint/parser');

module.exports = [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.agents/**',
      '.aws/**',
      '.codex/**',
    ],
  },
  {
    files: ['**/*.{ts,js,cjs,mjs}'],
    languageOptions: { parser: typescriptParser },
    linterOptions: { noInlineConfig: true },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.',
              message: 'Use #src/... or #openapi instead of relative imports.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/^\\./]',
          message: 'Use an absolute alias for dynamic imports.',
        },
        {
          selector:
            'CallExpression[callee.name="require"] > Literal[value=/^\\./]',
          message: 'Use an absolute alias for require calls.',
        },
        {
          selector: 'TSExternalModuleReference > Literal[value=/^\\./]',
          message: 'Use an absolute alias for TypeScript require imports.',
        },
        {
          selector: 'TSImportType[source.value=/^\\./]',
          message: 'Use an absolute alias for import types.',
        },
      ],
    },
  },
];

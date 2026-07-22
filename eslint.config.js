import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      sourceType: 'module',
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
]

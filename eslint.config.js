import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

const baseRules = {
  'no-unused-vars': ['warn', {
    vars: 'all',
    args: 'after-used',
    ignoreRestSiblings: true,
    varsIgnorePattern: '^React$',
    argsIgnorePattern: '^_',
  }],
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'backup-pack/**',
      'backups/**',
      'public/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...baseRules,
      'no-useless-escape': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        global: 'readonly',
      },
    },
    rules: {
      ...baseRules,
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['api/**/*.{js,cjs,mjs}', 'scripts/**/*.{js,cjs,mjs}', '*.config.js', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...baseRules,
      'no-console': 'off',
      'no-useless-escape': 'off',
    },
  },
];

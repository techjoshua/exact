import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const maintainedSource = [
	'apps/**/*.{ts,tsx}',
	'component-libraries/**/*.{ts,tsx}',
	'framework-adapters/**/*.{ts,tsx}',
	'packages/**/*.{ts,tsx}',
	'plugins/**/*.{ts,tsx}',
	'react-adapters/**/*.{ts,tsx}'
];

export default tseslint.config(
	{
		ignores: [
			'**/coverage/**',
			'**/dist/**',
			'**/node_modules/**',
			'**/.tmp/**',
			'**/.exact/**',
			'apps/react-reconciler-reference-*/**',
			'apps/react-reference-*/**',
			'packages/react-dom-compat/fixtures/**'
		]
	},
	{
		files: ['**/*.{js,mjs,cjs}'],
		...eslint.configs.recommended,
		languageOptions: {
			...eslint.configs.recommended.languageOptions,
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: globals.node
		},
		rules: {
			'no-empty': ['error', { allowEmptyCatch: true }]
		}
	},
	{
		files: ['scripts/benchmark-dom-list.mjs', 'scripts/check-r3f-browser.mjs'],
		languageOptions: {
			globals: globals.browser
		}
	},
	...tseslint.configs.recommended.map((entry) => ({
		...entry,
		files: maintainedSource
	})),
	{
		files: maintainedSource,
		rules: {
			'@typescript-eslint/no-empty-object-type': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-this-alias': 'off'
		}
	},
	{
		files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			]
		}
	},
	{
		files: [
			'packages/jsx-runtime/src/jsx-runtime.ts',
			'packages/testing/src/jest.ts',
			'packages/testing/src/vitest.ts'
		],
		rules: {
			'@typescript-eslint/no-namespace': 'off',
			'@typescript-eslint/no-unused-vars': 'off'
		}
	},
	{
		files: maintainedSource,
		ignores: [
			'**/*.test.{ts,tsx}',
			'**/*.spec.{ts,tsx}',
			'**/test-fixtures/**',
			'**/test-support/**',
			'**/*.config.ts',
			'packages/testing/src/jest.ts',
			'packages/testing/src/vitest.ts'
		],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{
					disallowTypeAnnotations: false,
					fixStyle: 'inline-type-imports',
					prefer: 'type-imports'
				}
			],
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			'@typescript-eslint/no-non-null-assertion': 'off'
		},
		linterOptions: {
			reportUnusedDisableDirectives: 'error'
		}
	}
);

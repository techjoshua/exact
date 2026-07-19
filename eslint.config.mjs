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
			'packages/react-dom-compat/src/fixtures/**'
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
		}
	},
	...tseslint.configs.recommendedTypeChecked.map((entry) => ({
		...entry,
		files: maintainedSource
	})),
	{
		files: maintainedSource,
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ fixStyle: 'inline-type-imports', prefer: 'type-imports' }
			],
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off'
		},
		linterOptions: {
			reportUnusedDisableDirectives: 'error'
		}
	}
);

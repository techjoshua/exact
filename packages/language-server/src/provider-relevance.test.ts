import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExactLanguageProjectionV1 } from '@exactjs/language-extension-api';
import { relevantLanguageProviderPackages } from './provider-relevance.js';

describe('language provider relevance', () => {
	it('uses attributed imports and package registrations but ignores ordinary imports', () => {
		const projection: ExactLanguageProjectionV1 = {
			protocol: 1,
			generation: 1,
			project: { root: 'fixture', kind: 'inferred' },
			document: {
				uri: 'file:///fixture.tsx',
				path: 'fixture.tsx',
				version: 1,
				textHash: 'fixture'
			},
			imports: [
				{
					specifier: '@exactjs/intl',
					range: { start: 0, end: 10 },
					kind: 'runtime',
					package: { name: '@exactjs/intl' }
				},
				{
					specifier: '@exactjs/motion',
					range: { start: 11, end: 20 },
					kind: 'runtime',
					enhancement: true,
					package: { name: '@exactjs/motion' }
				}
			],
			components: [],
			enhancements: [],
			jsx: [],
			expressions: [],
			types: []
		};

		expect(
			relevantLanguageProviderPackages(projection, [
				{
					localName: 'intl',
					moduleSpecifier: '@exactjs/intl/enhancements',
					importKind: 'namespace',
					declaredIn: path.resolve('exact.config.ts')
				}
			])
		).toEqual(['@exactjs/intl', '@exactjs/motion']);
	});
});

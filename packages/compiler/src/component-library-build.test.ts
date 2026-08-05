import { describe, expect, it } from 'vitest';
import { createExactPublishedComponentBuildFacts } from './component-library-build.js';

describe('component-library build facts', () => {
	it('normalizes and deterministically sorts package facts', () => {
		const facts = createExactPublishedComponentBuildFacts({
			package: { name: '@acme/cards', version: '1.0.0' },
			modules: [
				{
					path: './dist/index.js',
					facts: {
						protocol: 1,
						filename: '/src/index.tsx',
						components: [
							{
								id: '@acme/cards:Card',
								placement: 'isomorphic',
								artifactTargets: ['client', 'server']
							}
						],
						componentImports: [],
						rendererEnhancements: []
					}
				}
			],
			exports: [
				{
					subpath: '.',
					condition: 'default',
					module: './dist/index.js',
					exportName: 'Card',
					componentId: '@acme/cards:Card'
				}
			]
		});

		expect(facts.modules[0]?.path).toBe('dist/index.js');
		expect(facts.modules[0]?.facts).not.toHaveProperty('filename');
		expect(facts.exports[0]?.module).toBe('dist/index.js');
	});

	it('rejects exports without matching module component facts', () => {
		expect(() =>
			createExactPublishedComponentBuildFacts({
				package: { name: '@acme/cards', version: '1.0.0' },
				modules: [
					{
						path: 'dist/index.js',
						facts: {
							protocol: 1,
							components: [],
							componentImports: [],
							rendererEnhancements: []
						}
					}
				],
				exports: [
					{
						subpath: '.',
						condition: 'default',
						module: 'dist/index.js',
						exportName: 'Card',
						componentId: '@acme/cards:Card'
					}
				]
			})
		).toThrow(/has no @acme\/cards:Card component/);
	});
});

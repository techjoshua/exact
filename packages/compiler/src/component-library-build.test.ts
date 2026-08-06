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

	it('rejects package paths that escape the package and conflicting export selections', () => {
		expect(() =>
			createExactPublishedComponentBuildFacts({
				package: { name: '@acme/cards', version: '1.0.0' },
				modules: [{ path: '../outside.js', facts: emptyFacts() }],
				exports: []
			})
		).toThrow(/Invalid package-relative/);

		expect(() =>
			createExactPublishedComponentBuildFacts({
				package: { name: '@acme/cards', version: '1.0.0' },
				modules: [
					{ path: 'dist/a.js', facts: cardFacts('@acme/cards:A') },
					{ path: 'dist/b.js', facts: cardFacts('@acme/cards:B') }
				],
				exports: [
					{
						subpath: '.',
						condition: 'default',
						module: 'dist/a.js',
						exportName: 'Card',
						componentId: '@acme/cards:A'
					},
					{
						subpath: '.',
						condition: 'default',
						module: 'dist/b.js',
						exportName: 'Card',
						componentId: '@acme/cards:B'
					}
				]
			})
		).toThrow(/conflicting export/);
	});
});

function emptyFacts() {
	return {
		protocol: 1 as const,
		components: [],
		componentImports: [],
		rendererEnhancements: []
	};
}

function cardFacts(id: string) {
	return {
		...emptyFacts(),
		components: [
			{
				id,
				placement: 'isomorphic' as const,
				artifactTargets: ['client', 'server'] as const
			}
		]
	};
}

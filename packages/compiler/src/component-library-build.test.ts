import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExactPublishedModuleArtifacts } from './contracts/transform.js';
import { createTestWorkspace } from './test-support/workspace.js';
import {
	createExactPublishedComponentBuildFacts,
	writeExactPublishedComponentBuildFacts
} from './component-library-build.js';

describe('component-library build facts', () => {
	it('validates registration ownership at publication as well as consumption', () => {
		const artifacts = {
			clientModule: 'dist/client/Card.js',
			serverModule: 'dist/server/Card.js',
			build: {
				clientRegistrations: [
					{
						id: 'implementation:Card',
						componentId: 'component:Card',
						name: 'Card',
						exportName: 'Card'
					}
				],
				serverRegistrations: [],
				operations: [],
				boundaries: [],
				exposureRoots: []
			}
		} satisfies ExactPublishedModuleArtifacts;
		const input = {
			package: { name: '@acme/cards', version: '1.0.0' },
			modules: [
				{ path: artifacts.clientModule, facts: cardFacts('component:Card'), artifacts },
				{ path: artifacts.serverModule, facts: cardFacts('component:Card') }
			],
			exports: []
		};
		expect(createExactPublishedComponentBuildFacts(input).modules).toHaveLength(2);
		artifacts.build.clientRegistrations[0]!.componentId = 'foreign-owner';
		expect(() => createExactPublishedComponentBuildFacts(input)).toThrow(/registration owner/);
		artifacts.build.clientRegistrations[0]!.componentId = 'component:Card';
		artifacts.clientModule = 'dist/client/helper.js';
		expect(() => createExactPublishedComponentBuildFacts(input)).toThrow(
			/paired artifact module owner/
		);
	});

	it('keeps writes inside the physical package without rejecting dot-prefixed filenames', async () => {
		const workspace = await createTestWorkspace('exact-facts-writer-');
		const root = path.join(workspace, 'package');
		const outside = path.join(workspace, 'outside');
		await mkdir(root);
		await mkdir(outside);
		const input = { package: { name: '@acme/cards', version: '1.0.0' }, modules: [], exports: [] };
		await writeExactPublishedComponentBuildFacts(root, '..metadata.json', input);
		expect(JSON.parse(await readFile(path.join(root, '..metadata.json'), 'utf8')).package).toEqual(
			input.package
		);
		await symlink(outside, path.join(root, 'linked'), 'junction');
		await expect(
			writeExactPublishedComponentBuildFacts(root, 'linked/new/metadata.json', input)
		).rejects.toThrow(/symbolic link/);
		const sentinel = path.join(outside, 'existing.json');
		await writeFile(sentinel, 'unchanged');
		await symlink(sentinel, path.join(root, 'metadata.json'));
		await expect(
			writeExactPublishedComponentBuildFacts(root, 'metadata.json', input)
		).rejects.toThrow(/symbolic link/);
		expect(await readFile(sentinel, 'utf8')).toBe('unchanged');
		await expect(
			writeExactPublishedComponentBuildFacts(root, '../outside/metadata.json', input)
		).rejects.toThrow(/inside the package/);
	});

	it('rejects foreign drive paths independently of the host platform', () => {
		for (const file of [
			'C:/outside.js',
			'C:\\outside.js',
			'C:outside.js',
			'c:../outside.js',
			'//host/share/file.js'
		])
			expect(() =>
				createExactPublishedComponentBuildFacts({
					package: { name: '@acme/cards', version: '1.0.0' },
					modules: [{ path: file, facts: emptyFacts() }],
					exports: []
				})
			).toThrow(/Invalid package-relative/);
		expect(
			createExactPublishedComponentBuildFacts({
				package: { name: '@acme/cards', version: '1.0.0' },
				modules: [{ path: '..valid.js', facts: emptyFacts() }],
				exports: []
			}).modules[0]?.path
		).toBe('..valid.js');
	});

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
					componentModule: './dist/index.js',
					exportName: 'describedBy',
					componentId: '@acme/cards:Card'
				},
				{
					subpath: '.',
					condition: 'default',
					module: './dist/index.js',
					componentModule: './dist/index.js',
					exportName: 'default',
					componentId: '@acme/cards:Card'
				},
				{
					subpath: '.',
					condition: 'default',
					module: './dist/index.js',
					componentModule: './dist/index.js',
					exportName: 'Card',
					componentId: '@acme/cards:Card'
				}
			]
		});

		expect(facts.modules[0]?.path).toBe('dist/index.js');
		expect(facts.modules[0]?.facts).not.toHaveProperty('filename');
		expect(facts.exports[0]?.module).toBe('dist/index.js');
		expect(facts.exports[0]?.componentModule).toBe('dist/index.js');
		expect(facts.exports.map((record) => record.exportName)).toEqual([
			'Card',
			'default',
			'describedBy'
		]);
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
						componentModule: 'dist/index.js',
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
						componentModule: 'dist/a.js',
						exportName: 'Card',
						componentId: '@acme/cards:A'
					},
					{
						subpath: '.',
						condition: 'default',
						module: 'dist/b.js',
						componentModule: 'dist/b.js',
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

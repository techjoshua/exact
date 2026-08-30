/** @vitest-environment node */
import { transformSource } from '@exactjs/compiler';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { corpusScenarios } from './scenarios.js';

const fixtureNames = [
	...new Set(
		corpusScenarios
			.map(({ fixture }) => fixture)
			.filter((fixture) => fixture.endsWith('.fixtures.tsx'))
	)
];
const typescriptConfig = fileURLToPath(new URL('../tsconfig.test.json', import.meta.url));

describe('normative compiled structure', () => {
	for (const target of ['client', 'server'] as const) {
		it(`${target} artifacts contain no forbidden native fallback`, async () => {
			for (const fixture of fixtureNames) {
				const result = await compileFixture(fixture, target);
				expect(result.code, fixture).not.toMatch(
					/createCompiledVNode|__exactVNode|runtimeComponentArtifacts|createRuntimeComponentArtifact/
				);
			}
		});
	}

	it('emits target-local component facts and enhancement dependencies', async () => {
		const client = await compileFixture('enhancements.fixtures.tsx', 'client');
		const server = await compileFixture('enhancements.fixtures.tsx', 'server');

		expect(client.componentBuild.components.length).toBeGreaterThan(0);
		expect(server.componentBuild.components.length).toBeGreaterThan(0);
		expect(client.componentBuild.rendererEnhancements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					identity: './enhancement-routing.fixtures.js#corpus',
					exportName: 'corpus'
				})
			])
		);
		expect(client.code.match(/__exactEnhancements:/g)).toHaveLength(2);
		expect(server.code.match(/__exactEnhancements:/g)).toHaveLength(2);
	});

	it('attaches forward-declared component artifacts before registry execution', async () => {
		const { code, componentBuild } = await compileFixture('registry.fixtures.tsx', 'client');
		const registryExecution = code.indexOf(
			'__exactComponentRegistry(',
			code.indexOf('const CorpusViews')
		);
		const firstAttachment = code.indexOf('attachExactCompiledClientComponent');

		expect(firstAttachment).toBeGreaterThanOrEqual(0);
		expect(registryExecution).toBeGreaterThan(firstAttachment);
		expect(code).toMatch(/import\(['"]\.\/registry-lazy\.fixtures\.js['"]\)/);
		expect(componentBuild.componentImports).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					moduleSpecifier: './registry-lazy.fixtures.js',
					exportName: 'LazySecondView',
					reason: 'registry'
				})
			])
		);
	});
});

async function compileFixture(fixture: string, target: 'client' | 'server') {
	const filename = fileURLToPath(new URL(`./scenarios/${fixture}`, import.meta.url));
	return transformSource(await readFile(filename, 'utf8'), {
		filename,
		target,
		configFile: typescriptConfig
	});
}

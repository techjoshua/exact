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

	it('emits one durable definition for setup and interaction calls to one function task', async () => {
		const { code } = await compileFixture('tasks.fixtures.tsx', 'client');

		expect(code.match(/label: "load"/g)).toHaveLength(1);
		expect(code.match(/this\.state, \d+, 'ready'/g)).toHaveLength(1);
		expect(code).toContain('void load();');
	});

	it('encodes exact text operands while retaining arbitrary expression readers', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'client', 'hydrate');

		expect(code).toMatch(/\[0, \d+, \[0, \d+\], true\]/);
		expect(code).toMatch(/\[0, \d+, \[1, \d+\], true\]/);
		expect(code).toMatch(/\[11, \d+, \["Count & ", "", true, 0, \d+\]\]/);
		expect(code).toMatch(/__exactSlot =>/);
	});

	it('moves exact top-level prop relationships into the receiver input plan', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'client', 'hydrate');

		expect(code).toMatch(/const __exact_component_inputs_\d+ = \{ bindings:/);
		expect(code).toMatch(/inputs: __exact_component_inputs_\d+/);
		expect(code).toMatch(/__exactWriteState\(__exactInstance\.state, \d+, !__exactDependency\)/);
	});

	it('routes exact nested prop projections from their indexed root prop', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'client', 'hydrate');

		expect(code).toMatch(/const __exactDependency\w* = \(__exactReadState\(props, \d+\)/);
		expect(code).toContain(')?.label;');
		expect(code).toMatch(
			/__exactWriteState\(__exactInstance\.state, \d+, __exactDependency\w* \?\? 'missing'\)/
		);
	});

	it('selects capability-specific client constructors without generated wrappers', async () => {
		const capabilities = await compileFixture('capabilities.fixtures.tsx', 'client', 'hydrate');
		const tasks = await compileFixture('tasks.fixtures.tsx', 'client');

		expect(capabilities.code).toMatch(
			/constructRenderComponentInstance as __exactConstructRenderComponent/
		);
		expect(tasks.code).toMatch(/constructTaskComponentInstance as __exactConstructTaskComponent/);
		expect(capabilities.code).toMatch(
			/constructDurableComponentInstance as __exactConstructDurableComponent/
		);
		expect(capabilities.code).not.toMatch(/construct:\s*\([^)]*\)\s*=>\s*new __exactConstruct/);
		expect(tasks.code).not.toMatch(/construct:\s*\([^)]*\)\s*=>\s*new __exactConstruct/);
	});

	it('executes compiler-closed synchronous server programs without returned render closures', async () => {
		const { code } = await compileFixture('fundamentals.fixtures.tsx', 'server');

		expect(code.match(/mode: "stateless"/g)).toHaveLength(2);
		expect(code).toMatch(/return __exactPreparedServerRenderProgram\(/);
		expect(code).not.toMatch(/return \(\) => __exactPreparedServerRenderProgram\(/);
		expect(code).toMatch(
			/__exactSsr\.directComponent\(__exactContext, __exactOutput, Label, __exactValue_\d+/
		);
		expect(code).not.toMatch(/__exactComponentReceipt\(Label,/);
	});

	it('emits exact UTF-8 byte facts beside compiler-owned server spans', async () => {
		const { code } = await compileFixture('fundamentals.fixtures.tsx', 'server');

		expect(code).toMatch(/__exactSsr\.begin\(__exactContext, \d+, \d+, \d+, \d+\)/);
	});

	it('keeps compiler-created root identity outside the dynamic SSR attribute plan', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'server');

		expect(code).toMatch(/ssrRootStatic:\s*\[\s*" data-exact-id=\\"[^\"]+\\"/);
		expect(code).not.toMatch(/\[\s*0,\s*"data-exact-id",\s*"data-exact-id"\s*\]/);
	});

	it('folds compiler-proven native numeric and boolean constants into static structure', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'server');

		expect(code).toContain('maxLength=\\"2000\\" required></textarea>');
		expect(code).not.toMatch(/compiledAttribute\([^\n]+2000/);
	});

	it('publishes each compiler-known root opening as one server operation', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'server');

		expect(code).toMatch(/__exactSsr\.rootOpening\([^;]+"<section"/);
		expect(code).not.toContain('__exactSsr.rootAttributes(');
	});

	it('inlines exact server value propagation while retaining authored calculations', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'server');

		expect(code).toContain('this.state.direct = props.label;');
		expect(code).not.toMatch(/\(\([^)]*\) => \{\s*this\.state\.direct = [^}]+\}\)\(props\.label,/);
		expect(code).toContain(
			'normalizeServerLabel(__exactDependency); })(props.label, { signal: void 0 });'
		);
	});
});

async function compileFixture(
	fixture: string,
	target: 'client' | 'server',
	componentContractProjection?: 'hydrate'
) {
	const filename = fileURLToPath(new URL(`./scenarios/${fixture}`, import.meta.url));
	return transformSource(await readFile(filename, 'utf8'), {
		filename,
		target,
		componentContractProjection,
		configFile: typescriptConfig
	});
}

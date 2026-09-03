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

	it('uses indexed task sources only for exact slot reads', async () => {
		const { code } = await compileFixture('tasks.fixtures.tsx', 'client');

		expect(code).toMatch(/__exactIndexedActivationDependency\(props, \d+\)/);
		expect(code).toMatch(
			/__exactActivationDependency\(\(\) => \(__exactReadState\(props, \d+\) as number\) \+ 1\)/
		);
	});

	it('encodes exact text operands while retaining arbitrary expression readers', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'client', 'hydrate');

		expect(code).toMatch(/\[0, \d+, \[0, \d+\], true\]/);
		expect(code).toMatch(/\[0, \d+, \[1, \d+\], true\]/);
		expect(code).toMatch(/\[11, \d+, \["Count & ", "", true, 0, \d+\]\]/);
		expect(code).toMatch(/__exactSlot =>/);
	});

	it('bounds an opaque component range with the following compiler-known intrinsic', async () => {
		const client = await compileFixture('fundamentals.fixtures.tsx', 'client', 'hydrate');
		const server = await compileFixture('fundamentals.fixtures.tsx', 'server');

		expect(client.code).toMatch(/\[6, \d+, \d+, "span"\], \[4, \d+, \d+, true, \d+\]/);
		expect(client.code).not.toMatch(/<!--x:\d+--><!--\/x:\d+--><span data-role=\\"after-label\\"/);
		expect(client.code).toMatch(
			/<!--x:\d+--><!--\/x:\d+--><span data-role=\\"nested-after-label\\"/
		);
		expect(server.code).toMatch(/__exactSsr\.directComponent\([^;]+, true\);/);
	});

	it('shares one dispatcher across statement-bodied readers', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'client', 'hydrate');
		const start = code.indexOf('function MixedReaderDispatch');
		const end = code.indexOf('export const mixedReaderDispatchRoot', start);
		const component = code.slice(start, end);

		expect(component).toMatch(/__exactSlot => \{/);
		expect(component.match(/if \(__exactSlot === \d+\) \{/g)).toHaveLength(2);
	});

	it('encodes exact intrinsic prop reads without a generated value writer', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'client', 'hydrate');

		expect(code).toMatch(/\[12, \d+, \d+, \[\["aria-label", 1, \d+\]\], true\]/);
		expect(code).toMatch(/\[12, \d+, \d+, \[\["value", 0, \d+\]\], true\]/);
	});

	it('encodes a keyed item property as a direct child prop operand', async () => {
		const { code } = await compileFixture('capabilities.fixtures.tsx', 'client', 'hydrate');

		expect(code).toContain('label: [__exactPropertyOperand, item, "label"]');
		expect(code).not.toContain('__exactExpression(() => item.label)');
	});

	it('encodes an object-valued indexed prop property as a direct child prop operand', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'client', 'hydrate');

		expect(code).toMatch(
			/label: \[__exactPropertyOperand, __exactReadState\(props, \d+\) as \{\s*label: string;\s*\}, "label"\]/
		);
		expect(code).not.toMatch(
			/label: __exactForwardedExpression\(\(\) => \(__exactReadState\(props, \d+\)/
		);
	});

	it('keeps only arbitrary expressions in mixed intrinsic property writers', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'client', 'hydrate');

		expect(code).toMatch(/\[12, \d+, \d+, \[\["data-count", 0, \d+\]\], true\]/);
		expect(code).toMatch(/__exactApply\("disabled", !__exactReadState\(this\.state, \d+\)\)/);
		expect(code).not.toMatch(/__exactApply\("data-count", __exactReadState\(this\.state, \d+\)\)/);
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

	it('omits resumption metadata for fully reconstructible prop snapshots', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'server');
		const hydrated = await compileFixture('state.fixtures.tsx', 'client', 'hydrate');
		const serverSnapshot = code.slice(
			code.indexOf('const SnapshotProjection ='),
			code.indexOf('const __exactImplementation_SnapshotProjectionParent')
		);
		const clientSnapshot = hydrated.code.slice(
			hydrated.code.indexOf('const SnapshotProjection ='),
			hydrated.code.indexOf('const __exactImplementation_SnapshotProjectionParent')
		);

		expect(serverSnapshot).not.toContain('resumption:');
		expect(clientSnapshot).not.toContain('resumption:');
	});

	it('emits the same finite positional prop schema into both target artifacts', async () => {
		const client = await compileFixture('state.fixtures.tsx', 'client', 'hydrate');
		const server = await compileFixture('state.fixtures.tsx', 'server');
		const schema = /serialization:\s*(\[\s*1,[\s\S]*?\]),\s*(?:attach|issue):/;
		const clientMatch = client.code.match(schema)?.[1];
		const serverMatch = server.code.match(schema)?.[1];

		expect(clientMatch).toBeTruthy();
		expect(serverMatch).toBe(clientMatch);
		expect(clientMatch).toContain('"payload"');
		expect(clientMatch).toContain('"label"');
	});

	it('records unconditional primitive state defaults only in the server omission schema', async () => {
		const server = await compileFixture('state.fixtures.tsx', 'server');
		const hydrated = await compileFixture('state.fixtures.tsx', 'client', 'hydrate');

		expect(server.code).toMatch(/stateDefaults:\s*\[\s*\[\s*"status",\s*"idle"\s*\]/);
		expect(hydrated.code).not.toContain('stateDefaults:');
	});

	it('closes compiler-known server conditional classes without request-local collections', async () => {
		const { code } = await compileFixture('state.fixtures.tsx', 'server');

		expect(code).toMatch(
			/className:\s*"state-root"\s*\+\s*\(this\.state\.enabled\s*===\s*true\s*\?/
		);
		expect(code).not.toMatch(/className:\s*\[\s*["']state-root/);
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

		expect(code.match(/mode: "stateless"/g)).toHaveLength(3);
		expect(code).toMatch(/return \(__exactPreparedServerRenderProgram\(/);
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

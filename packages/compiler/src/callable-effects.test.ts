import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	compileProjectArtifacts,
	createExactArtifactDevState,
	transform,
	updateExactArtifactDevState
} from './index.js';
import { analyzeSource } from './compilation/source-analysis.js';
import { artifactAnalysis } from './compilation/analysis-results.js';

describe('symbol-level placement inference', () => {
	it('keeps effect-only client setup SSR-capable while honoring server directives', () => {
		const analysis = analyzeSource(
			`
      /** @exact client */
      declare function render(): void;
      /** @exact server */
      declare function load(): string;
      export function ClientPage() { render(); return () => <p />; }
      export function ServerPage() { const value = load(); return () => <p>{value}</p>; }
    `,
			{ filename: 'C:/src/directives.tsx' }
		);

		expect(
			analysis.components.find((component) => component.name === 'ClientPage')?.placement
		).toBe('isomorphic');
		expect(
			analysis.components.find((component) => component.name === 'ServerPage')?.placement
		).toBe('server');
	});

	it('keeps imported references neutral until they are invoked', () => {
		const analysis = analyzeSource(
			`
      import { createThing } from "opaque-package";
      export const factory = createThing;
    `,
			{ filename: 'C:/src/reference.ts' }
		);

		expect(analysis.exports.find((value) => value.name === 'factory')?.placement).toBe(
			'isomorphic'
		);
	});

	it('constrains opaque helpers through a client event invocation', () => {
		const analysis = analyzeSource(
			`
      declare const service: { run(): void };
      function invoke(action: () => void) { action(); service.run(); }
      export function Panel() { return () => <button onClick={() => invoke(() => service.run())} />; }
    `,
			{ filename: 'C:/src/client-invocation.tsx' }
		);

		const invoke = analysis.callables.find((callable) => callable.name === 'invoke');
		expect(invoke?.effect).toBe('unknown');
		expect(invoke?.artifactTargets).toEqual(['client']);
	});

	it('propagates server effects through local helper chains', () => {
		const analysis = analyzeSource(
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n      function read() { return readFile("title.txt", "utf8"); }\n      function load() { return read(); }\n      export function Page(this: Component<{ title?: string }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.latest()) => { this.state.title = await load(); };\nrunFixtureTask();\n        return () => <p>{this.state.title}</p>;\n      }\n    ',
			{ filename: 'C:/src/Page.tsx' }
		);
		const task = analysis.components[0]!.tasks[0]!;
		expect(task.placement).toBe('server');
		expect(task.effectSources).toContainEqual(
			expect.objectContaining({
				environment: 'server',
				path: expect.arrayContaining(['load', 'read'])
			})
		);
	});

	it('converges recursive summaries without growing diagnostic paths', () => {
		const analysis = analyzeSource(
			'import { TaskContext } from "@exactjs/core";\n\n      function left(value: number): number { return value ? right(value - 1) : process.pid; }\n      function right(value: number): number { return left(value); }\n      export function Page(this: Component<{ value?: number }>) {\n        const runFixtureTask = (_task: TaskContext = TaskContext.latest()) => { this.state.value = right(2); };\nrunFixtureTask();\n        return () => <p />;\n      }\n    ',
			{ filename: 'C:/src/Recursive.tsx' }
		);
		const task = analysis.components[0]!.tasks[0]!;
		expect(task.placement).toBe('server');
		expect(task.effectSources?.[0]?.path.length).toBeLessThanOrEqual(5);
	});

	it('requires an explicit task boundary for opaque imported calls', () => {
		expect(() =>
			transform(
				'import { TaskContext } from "@exactjs/core";\n\n      import { inspect } from "opaque-package";\n      function Page(this: Component<{ value?: string }>) {\n        const runFixtureTask = (_task: TaskContext = TaskContext.latest()) => { this.state.value = inspect(); };\nrunFixtureTask();\n        return () => <p />;\n      }\n    ',
				{ filename: 'C:/src/Opaque.tsx' }
			)
		).toThrow('task placement depends on an opaque call');
	});

	it('does not silently neutralize unresolved dynamic dispatch', () => {
		expect(() =>
			transform(
				'import { TaskContext } from "@exactjs/core";\n\n      function invoke(callback: () => string) { return callback(); }\n      export function Page(this: Component<{ value?: string }>, props: { callback: () => string }) {\n        const runFixtureTask = (_task: TaskContext = TaskContext.latest()) => { this.state.value = invoke(props.callback); };\nrunFixtureTask();\n        return () => <p />;\n      }\n    ',
				{ filename: 'C:/src/dynamic.tsx' }
			)
		).toThrow('task placement depends on an opaque call');
	});

	it('keeps unknown calls visible when a known effect already restricts placement', () => {
		const analysis = analyzeSource(
			'import { TaskContext } from "@exactjs/core";\n\n      function invoke(callback: () => string) { return process.env.VALUE ?? callback(); }\n      export function Page(this: Component<{ value?: string }>, props: { callback: () => string }) {\n        const runFixtureTask = (_task: TaskContext = TaskContext.latest()) => { this.state.value = invoke(props.callback); };\nrunFixtureTask();\n        return () => <p />;\n      }\n    ',
			{ filename: 'C:/src/restricted-unknown.tsx' }
		);
		expect(analysis.components[0]!.tasks[0]).toMatchObject({
			placement: 'server',
			environmentEffect: 'unknown'
		});
		expect(
			new Set(analysis.components[0]!.tasks[0]!.effectSources?.map((source) => source.environment))
		).toEqual(new Set(['server', 'unknown']));
	});

	it('keeps opaque component setup visibly unknown', () => {
		const analysis = analyzeSource(
			`
      import { inspect } from "opaque-package";
      export function Page() { const value = inspect(); return () => <p>{value}</p>; }
    `,
			{ filename: 'C:/src/OpaquePage.tsx' }
		);
		expect(analysis.components[0]).toMatchObject({
			placement: 'unknown',
			environmentEffect: 'unknown',
			artifactTargets: []
		});
		expect(analysis.components[0]!.diagnostics.join('\n')).toContain(
			'component placement depends on an opaque call'
		);
	});

	it('uses declaration identity for shadowed platform globals and exports', () => {
		const analysis = analyzeSource(
			`
      const process = { env: { SAFE: "yes" } };
      function hidden() { const process = { env: { SAFE: "also" } }; return process.env.SAFE; }
      export function value() { return process.env.SAFE + hidden(); }
    `,
			{ filename: 'C:/src/shadowed.ts' }
		);
		expect(
			analysis.callables.find((callable) => callable.exportNames.includes('value'))?.effect
		).toBe('neutral');
		expect(
			analysis.callables
				.filter((callable) => callable.exportNames.length)
				.flatMap((callable) => callable.exportNames)
		).toEqual(['value']);
	});

	it('keeps exported value targets consistent with emitted artifacts', () => {
		const source = `
      const secret = process.env.SECRET;
      export { secret };
      export const universal = 42;
    `;
		const analysis = analyzeSource(source, { filename: 'C:/src/values.ts' });
		expect(analysis.exports).toEqual(
			expect.arrayContaining([
				{ name: 'secret', kind: 'value', placement: 'server' },
				{ name: 'universal', kind: 'value', placement: 'isomorphic' }
			])
		);
		expect(analysis.symbols).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ exportName: 'secret', kind: 'value', target: 'server' }),
				expect.objectContaining({ exportName: 'universal', kind: 'value', target: 'both' })
			])
		);
		expect(transform(source, { filename: 'C:/src/values.ts', target: 'client' })).not.toContain(
			'secret'
		);
		expect(transform(source, { filename: 'C:/src/values.ts', target: 'client' })).toContain(
			'universal'
		);
	});

	it('resolves methods with known receivers and callable aliases', () => {
		const analysis = analyzeSource(
			'import { TaskContext } from "@exactjs/core";\n\n      const registry = { quote() { return process.env.RATE; } };\n      const quote = registry.quote;\n      export function Page(this: Component<{ direct?: string; alias?: string }>) {\n        const runFixtureTask = (_task: TaskContext = TaskContext.latest()) => { this.state.direct = registry.quote(); this.state.alias = quote(); };\nrunFixtureTask();\n        return () => <p />;\n      }\n    ',
			{ filename: 'C:/src/methods.tsx' }
		);
		expect(analysis.components[0]!.tasks[0]!.placement).toBe('server');
		expect(analysis.components[0]!.tasks[0]!.effectSources?.[0]?.path).toContain('process');
	});

	it('maps state effects through helper parameters and preserves unknown receiver flow', () => {
		const exact = analyzeSource(
			'import { TaskContext } from "@exactjs/core";\n\n      function assign(owner: Component<{ value?: string }>) { owner.state.value = "ready"; }\n      function forward(owner: Component<{ value?: string }>) { assign(owner); }\n      export function Page(this: Component<{ value?: string }>) {\n        const runFixtureTask = (_task: TaskContext = TaskContext.latest()) => forward(this);\nrunFixtureTask();\n        return () => <p />;\n      }\n    ',
			{ filename: 'C:/src/state-flow.tsx' }
		);
		expect(exact.components[0]!.tasks[0]!.writes).toContainEqual(
			expect.objectContaining({
				path: 'value',
				confidence: 'exact',
				receiver: { kind: 'component' }
			})
		);

		const broad = analyzeSource(
			'import { TaskContext } from "@exactjs/core";\n\n      function assign(owner: Component<{ value?: string }>) { owner.state.value = "ready"; }\n      export function Page(this: Component<{ value?: string }>) {\n        const runFixtureTask = (_task: TaskContext = TaskContext.latest()) => assign({} as Component<{ value?: string }>);\nrunFixtureTask();\n        return () => <p />;\n      }\n    ',
			{ filename: 'C:/src/state-flow-unknown.tsx' }
		);
		expect(broad.components[0]!.tasks[0]!.writes).toContainEqual(
			expect.objectContaining({
				path: 'value',
				confidence: 'unknown',
				receiver: { kind: 'unknown' }
			})
		);
	});

	it('splits independent executable module initializers without changing their order', () => {
		const source = `
      window.addEventListener("load", () => {});
      process.stdout.write("ready");
      export function Pure() { return () => <p />; }
    `;
		const analysis = analyzeSource(source, { filename: 'C:/src/initializers.tsx' });
		expect(
			analysis.callables
				.filter((callable) => callable.kind === 'module-initializer')
				.map((callable) => callable.effect)
		).toEqual(['browser', 'server']);
		const client = transform(source, { filename: 'C:/src/initializers.tsx', target: 'client' });
		const server = transform(source, { filename: 'C:/src/initializers.tsx', target: 'server' });
		expect(client).toContain('window.addEventListener');
		expect(client).not.toContain('process.stdout.write');
		expect(server).not.toContain('window.addEventListener');
		expect(server).toContain('process.stdout.write');
	});

	it('rejects opaque side-effect imports instead of assuming they are neutral', () => {
		expect(() =>
			transform(
				`import "opaque-package/register"; export function Pure() { return () => <p />; }`,
				{
					filename: 'C:/src/Page.tsx',
					target: 'client'
				}
			)
		).toThrow('executable module initializer depends on an opaque call or side-effect import');
	});

	it('follows non-artifact TypeScript dependencies during project compilation', async () => {
		const root = path.join(tmpdir(), `exact-placement-${process.pid}-${Date.now()}`);
		await mkdir(root, { recursive: true });
		await writeFile(
			path.join(root, 'provider.ts'),
			`export function quote() { return process.env.RATE; }`
		);
		const pageFile = path.join(root, 'Page.tsx');
		await writeFile(
			pageFile,
			'import { TaskContext } from "@exactjs/core";\n\n      import { quote } from "./provider.js";\n      export function Page(this: Component<{ value?: string }>) {\n        const runFixtureTask = (_task: TaskContext = TaskContext.latest()) => { this.state.value = quote(); };\nrunFixtureTask();\n        return () => <p />;\n      }\n    '
		);
		const [compiled] = await compileProjectArtifacts([pageFile], {
			rootDir: root,
			outDir: path.join(root, '.exact'),
			serverComponents: true
		});
		expect(artifactAnalysis(compiled!).components[0]!.tasks[0]!.placement).toBe('server');
		expect(await readFile(compiled!.clientFile, 'utf8')).not.toContain('quote()');
		expect(await readFile(compiled!.serverFile, 'utf8')).toContain('quote()');
	});

	it('retains neutral components in client server-component artifacts', () => {
		const client = transform(
			`
      export function PureChild() { return () => <span>Pure</span>; }
      export function ClientParent() { return () => <button onClick={() => {}}><PureChild /></button>; }
    `,
			{ filename: 'C:/src/Pure.tsx', target: 'client', serverComponents: true }
		);
		expect(client).toContain('function PureChild');
		expect(client).toContain('function ClientParent');
	});

	it('invalidates artifact entries when a transitive analysis dependency changes', async () => {
		const root = path.join(tmpdir(), `exact-placement-watch-${process.pid}-${Date.now()}`);
		await mkdir(root, { recursive: true });
		const provider = path.join(root, 'provider.ts');
		const page = path.join(root, 'Page.tsx');
		const outDir = path.join(root, '.exact');
		await writeFile(provider, `export function value() { return process.env.VALUE; }`);
		await writeFile(
			page,
			'import { TaskContext } from "@exactjs/core";\nimport { value } from "./provider.js"; export function Page(this: Component<{ value?: string }>) { const runFixtureTask = (_task: TaskContext = TaskContext.latest()) => { this.state.value = value(); };\nrunFixtureTask(); return () => <p />; }'
		);
		const artifactOptions = {
			rootDir: root,
			outDir,
			packageRoot: root,
			sourceRoot: root,
			serverComponents: true
		};
		const state = await createExactArtifactDevState([page], artifactOptions);
		expect(state.entries[0]!.build.dependencies).toContain('provider.ts');
		expect(await readFile(state.entries[0]!.serverFile, 'utf8')).toContain('value()');

		await writeFile(provider, `export function value() { return window.location.href; }`);
		const updated = await updateExactArtifactDevState(state, [page], [provider], artifactOptions);
		expect(updated.diff.changed.map((entry) => path.resolve(entry.inputFile))).toEqual([
			path.resolve(page)
		]);
		expect(artifactAnalysis(updated.compiled[0]!).components[0]!.tasks[0]!.placement).toBe(
			'client'
		);
		const warmClient = await readFile(updated.compiled[0]!.clientFile, 'utf8');
		const warmServer = await readFile(updated.compiled[0]!.serverFile, 'utf8');
		const warmBuild = JSON.stringify(updated.compiled[0]!.build);
		const [clean] = await compileProjectArtifacts([page], artifactOptions);
		expect(await readFile(clean!.clientFile, 'utf8')).toBe(warmClient);
		expect(await readFile(clean!.serverFile, 'utf8')).toBe(warmServer);
		expect(JSON.stringify(clean!.build)).toBe(warmBuild);
	});
});

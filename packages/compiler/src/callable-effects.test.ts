import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	analyzeSource,
	compileProjectArtifacts,
	createExactArtifactDevState,
	transform,
	updateExactArtifactDevState
} from './index.js';

describe('symbol-level placement inference', () => {
	it('uses callable client and server directives at invocation sites', () => {
		const manifest = analyzeSource(
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
			manifest.components.find((component) => component.name === 'ClientPage')?.placement
		).toBe('client');
		expect(
			manifest.components.find((component) => component.name === 'ServerPage')?.placement
		).toBe('server');
	});

	it('keeps imported references neutral until they are invoked', () => {
		const manifest = analyzeSource(
			`
      import { createThing } from "opaque-package";
      export const factory = createThing;
    `,
			{ filename: 'C:/src/reference.ts' }
		);

		expect(manifest.exports.find((value) => value.name === 'factory')?.placement).toBe(
			'isomorphic'
		);
	});

	it('propagates interactive JSX placement through imported render helpers', () => {
		const helper = analyzeSource(
			`export function renderButton(click: () => void) { return <button onClick={click}>Save</button>; }`,
			{ filename: 'C:/src/render-button.tsx' }
		);
		const manifest = analyzeSource(
			`
      import { renderButton } from './render-button.js';
      export function Page() { return () => <section>{renderButton(() => undefined)}</section>; }
    `,
			{ filename: 'C:/src/page.tsx', importedManifests: [helper] }
		);

		expect(helper.callables.find((callable) => callable.name === 'renderButton')?.effect).toBe(
			'browser'
		);
		expect(manifest.components.find((component) => component.name === 'Page')).toMatchObject({
			placement: 'client',
			artifactTargets: ['client']
		});
	});

	it('constrains opaque helpers through a client event invocation', () => {
		const manifest = analyzeSource(
			`
      declare const service: { run(): void };
      function invoke(action: () => void) { action(); service.run(); }
      export function Panel() { return () => <button onClick={() => invoke(() => service.run())} />; }
    `,
			{ filename: 'C:/src/client-invocation.tsx' }
		);

		const invoke = manifest.callables.find((callable) => callable.name === 'invoke');
		expect(invoke?.effect).toBe('unknown');
		expect(invoke?.artifactTargets).toEqual(['client']);
	});

	it('propagates server effects through local helper chains', () => {
		const manifest = analyzeSource(
			`
      import { readFile } from "node:fs/promises";
      function read() { return readFile("title.txt", "utf8"); }
      function load() { return read(); }
      export function Page(this: Component<{ title?: string }>) {
        this.task(async () => { this.state.title = await load(); });
        return () => <p>{this.state.title}</p>;
      }
    `,
			{ filename: 'C:/src/Page.tsx' }
		);
		const task = manifest.components[0]!.tasks[0]!;
		expect(task.placement).toBe('server');
		expect(task.effectSources).toContainEqual(
			expect.objectContaining({
				environment: 'server',
				path: expect.arrayContaining(['load', 'read'])
			})
		);
	});

	it('converges recursive summaries without growing diagnostic paths', () => {
		const manifest = analyzeSource(
			`
      function left(value: number): number { return value ? right(value - 1) : process.pid; }
      function right(value: number): number { return left(value); }
      export function Page(this: Component<{ value?: number }>) {
        this.task(() => { this.state.value = right(2); });
        return () => <p />;
      }
    `,
			{ filename: 'C:/src/Recursive.tsx' }
		);
		const task = manifest.components[0]!.tasks[0]!;
		expect(task.placement).toBe('server');
		expect(task.effectSources?.[0]?.path.length).toBeLessThanOrEqual(5);
	});

	it('requires an explicit task boundary for opaque imported calls', () => {
		expect(() =>
			transform(
				`
      import { inspect } from "opaque-package";
      function Page(this: Component<{ value?: string }>) {
        this.task(() => { this.state.value = inspect(); });
        return () => <p />;
      }
    `,
				{ filename: 'C:/src/Opaque.tsx' }
			)
		).toThrow('task placement depends on an opaque call');
	});

	it('does not silently neutralize unresolved dynamic dispatch', () => {
		expect(() =>
			transform(
				`
      function invoke(callback: () => string) { return callback(); }
      export function Page(this: Component<{ value?: string }>, props: { callback: () => string }) {
        this.task(() => { this.state.value = invoke(props.callback); });
        return () => <p />;
      }
    `,
				{ filename: 'C:/src/dynamic.tsx' }
			)
		).toThrow('task placement depends on an opaque call');
	});

	it('keeps unknown calls visible when a known effect already restricts placement', () => {
		const manifest = analyzeSource(
			`
      function invoke(callback: () => string) { return process.env.VALUE ?? callback(); }
      export function Page(this: Component<{ value?: string }>, props: { callback: () => string }) {
        this.task(() => { this.state.value = invoke(props.callback); });
        return () => <p />;
      }
    `,
			{ filename: 'C:/src/restricted-unknown.tsx' }
		);
		expect(manifest.components[0]!.tasks[0]).toMatchObject({
			placement: 'server',
			environmentEffect: 'unknown'
		});
		expect(
			new Set(manifest.components[0]!.tasks[0]!.effectSources?.map((source) => source.environment))
		).toEqual(new Set(['server', 'unknown']));
	});

	it('keeps opaque component setup visibly unknown', () => {
		const manifest = analyzeSource(
			`
      import { inspect } from "opaque-package";
      export function Page() { const value = inspect(); return () => <p>{value}</p>; }
    `,
			{ filename: 'C:/src/OpaquePage.tsx' }
		);
		expect(manifest.components[0]).toMatchObject({
			placement: 'unknown',
			environmentEffect: 'unknown',
			artifactTargets: []
		});
		expect(manifest.components[0]!.diagnostics.join('\n')).toContain(
			'component placement depends on an opaque call'
		);
	});

	it('resolves namespace imports and re-export chains through v2 summaries', () => {
		const provider = analyzeSource(`export function quote() { return process.env.RATE; }`, {
			filename: 'C:/src/provider.ts'
		});
		const barrel = analyzeSource(`export { quote as getQuote } from "./provider.js";`, {
			filename: 'C:/src/barrel.ts',
			importedManifests: [provider]
		});
		const manifest = analyzeSource(
			`
      import * as rates from "./barrel.js";
      export function Page(this: Component<{ value?: string }>) {
        this.task(() => { this.state.value = rates.getQuote(); });
        return () => <p />;
      }
    `,
			{ filename: 'C:/src/Page.tsx', importedManifests: [provider, barrel] }
		);
		expect(manifest.components[0]!.tasks[0]!.placement).toBe('server');
		expect(manifest.components[0]!.tasks[0]!.effectSources).toContainEqual(
			expect.objectContaining({
				environment: 'server',
				path: expect.arrayContaining(['getQuote', 'quote', 'process'])
			})
		);
	});

	it('uses declaration identity for shadowed platform globals and exports', () => {
		const manifest = analyzeSource(
			`
      const process = { env: { SAFE: "yes" } };
      function hidden() { const process = { env: { SAFE: "also" } }; return process.env.SAFE; }
      export function value() { return process.env.SAFE + hidden(); }
    `,
			{ filename: 'C:/src/shadowed.ts' }
		);
		expect(
			manifest.callables.find((callable) => callable.exportNames.includes('value'))?.effect
		).toBe('neutral');
		expect(
			manifest.callables
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
		const manifest = analyzeSource(source, { filename: 'C:/src/values.ts' });
		expect(manifest.exports).toEqual(
			expect.arrayContaining([
				{ name: 'secret', kind: 'value', placement: 'server' },
				{ name: 'universal', kind: 'value', placement: 'isomorphic' }
			])
		);
		expect(manifest.symbols).toEqual(
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
		const manifest = analyzeSource(
			`
      const registry = { quote() { return process.env.RATE; } };
      const quote = registry.quote;
      export function Page(this: Component<{ direct?: string; alias?: string }>) {
        this.task(() => { this.state.direct = registry.quote(); this.state.alias = quote(); });
        return () => <p />;
      }
    `,
			{ filename: 'C:/src/methods.tsx' }
		);
		expect(manifest.components[0]!.tasks[0]!.placement).toBe('server');
		expect(manifest.components[0]!.tasks[0]!.effectSources?.[0]?.path).toContain('process');
	});

	it('maps state effects through helper parameters and preserves unknown receiver flow', () => {
		const exact = analyzeSource(
			`
      function assign(owner: Component<{ value?: string }>) { owner.state.value = "ready"; }
      function forward(owner: Component<{ value?: string }>) { assign(owner); }
      export function Page(this: Component<{ value?: string }>) {
        this.task(() => forward(this));
        return () => <p />;
      }
    `,
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
			`
      function assign(owner: Component<{ value?: string }>) { owner.state.value = "ready"; }
      export function Page(this: Component<{ value?: string }>) {
        this.task(() => assign({} as Component<{ value?: string }>));
        return () => <p />;
      }
    `,
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
		const manifest = analyzeSource(source, { filename: 'C:/src/initializers.tsx' });
		expect(
			manifest.callables
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

	it('resolves side-effect-only imports through module initializer summaries', () => {
		const provider = analyzeSource(`process.stdout.write("provider");`, {
			filename: 'C:/src/provider.ts'
		});
		const source = `import "./provider.js"; export function Pure() { return () => <p />; }`;
		const manifest = analyzeSource(source, {
			filename: 'C:/src/Page.tsx',
			importedManifests: [provider]
		});
		expect(
			manifest.callables.find((callable) => callable.kind === 'module-initializer')?.effect
		).toBe('server');
		expect(
			transform(source, {
				filename: 'C:/src/Page.tsx',
				target: 'client',
				importedManifests: [provider]
			})
		).not.toContain('provider.js');
		expect(
			transform(source, {
				filename: 'C:/src/Page.tsx',
				target: 'server',
				importedManifests: [provider]
			})
		).toContain('provider.js');
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
			`
      import { quote } from "./provider.js";
      export function Page(this: Component<{ value?: string }>) {
        this.task(() => { this.state.value = quote(); });
        return () => <p />;
      }
    `
		);
		const [compiled] = await compileProjectArtifacts([pageFile], {
			rootDir: root,
			outDir: path.join(root, '.exact'),
			serverComponents: true
		});
		expect(compiled!.manifest.components[0]!.tasks[0]!.placement).toBe('server');
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
			`import { value } from "./provider.js"; export function Page(this: Component<{ value?: string }>) { this.task(() => { this.state.value = value(); }); return () => <p />; }`
		);
		const artifactOptions = {
			rootDir: root,
			outDir,
			packageRoot: root,
			sourceRoot: root,
			serverComponents: true
		};
		const state = await createExactArtifactDevState([page], artifactOptions);
		expect(state.entries[0]!.manifest.dependencies).toContain('provider.ts');
		expect(state.entries[0]!.manifest.components[0]!.tasks[0]!.placement).toBe('server');

		await writeFile(provider, `export function value() { return window.location.href; }`);
		const updated = await updateExactArtifactDevState(state, [page], [provider], artifactOptions);
		expect(updated.diff.changed.map((entry) => path.resolve(entry.inputFile))).toEqual([
			path.resolve(page)
		]);
		expect(updated.entries[0]!.manifest.components[0]!.tasks[0]!.placement).toBe('client');
		const warmClient = await readFile(updated.compiled[0]!.clientFile, 'utf8');
		const warmServer = await readFile(updated.compiled[0]!.serverFile, 'utf8');
		const warmManifest = JSON.stringify(updated.compiled[0]!.manifest);
		const [clean] = await compileProjectArtifacts([page], artifactOptions);
		expect(await readFile(clean!.clientFile, 'utf8')).toBe(warmClient);
		expect(await readFile(clean!.serverFile, 'utf8')).toBe(warmServer);
		expect(JSON.stringify(clean!.manifest)).toBe(warmManifest);
	});
});

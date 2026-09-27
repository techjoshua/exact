/** @vitest-environment jsdom */
import { it, expect, onTestFinished } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate, createExactClient } from '@exactjs/hydrate';
import { createServerBoundaryReceipt } from '@exactjs/core/runtime/component-operations';
import { createCompiledComponentRegistry } from '@exactjs/core/runtime/registry';
import { hydrate as hydrateOnly } from '@exactjs/hydrate/root';
import { hydrateCompiledComponentRoot } from '@exactjs/hydrate/framework/component-root';

it.each([
	{ only: false, nested: false },
	{ only: true, nested: false },
	{ only: false, nested: true },
	{ only: true, nested: true },
	{ only: 'compiled', nested: false },
	{ only: 'compiled', nested: true }
])('adopts a lazy registry root ($only, nested=$nested)', async ({ only, nested }) => {
	const root = await createTestWorkspace('.exact-root-registry-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		path.join(root, 'panel.tsx'),
		`import {type Component} from '@exactjs/core'; export function Panel(this:Component<{count:number}>){this.state.count=0;return ()=> <section><input value="original"/><button onClick={()=>this.state.count++}>Count {this.state.count}</button></section>;}`
	);
	if (nested)
		await writeFile(
			path.join(root, 'middle.tsx'),
			`import {createComponentRegistry} from '@exactjs/core';const Inner=createComponentRegistry(({lazy})=>({panel:lazy(()=>import('./panel.js').then(m=>m.Panel))}));export function Middle(){return ()=> <Inner.panel/>;}`
		);
	await writeFile(
		entry,
		`import {createComponentRegistry,Suspense} from '@exactjs/core'; const Views=createComponentRegistry(({lazy})=>({lazy:lazy(()=>import('./${nested ? 'middle' : 'panel'}.js').then(m=>m.${nested ? 'Middle' : 'Panel'}))}));export function Page(){return ()=> <Suspense fallback={<i>Wait</i>}><Views.lazy/></Suspense>;}`
	);
	const artifacts = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated'),
		serverComponents: true
	});
	const page = artifacts.find((a) => a.inputFile === entry)!;
	const server = await importArtifact(page.serverFile, path.join(root, 'server.mjs'));
	const client = await importArtifact(page.clientFile, path.join(root, 'client.mjs'));
	const output = await renderToHydratableString(receipt(server.Page as never, {}));
	const container = document.createElement('div');
	container.innerHTML = output.htmlWithHydration;
	const original = container.querySelector('section');
	const input = container.querySelector('input')!;
	input.value = 'edited before hydration';
	const errors: unknown[] = [];
	const view = (only === 'compiled' ? hydrateCompiledComponentRoot : only ? hydrateOnly : hydrate)(
		receipt(client.Page as never, {}),
		container,
		{
			onErrorReport: (r) => errors.push(r.error)
		}
	);
	onTestFinished(() => view.dispose());
	input.value = 'edited';
	await view.whenSettled();
	expect(container.querySelector('section')).toBe(original);
	expect(input.value).toBe('edited');
	container.querySelector('button')!.click();
	await Promise.resolve();
	expect(container.querySelector('button')!.textContent).toBe('Count 1');
	expect(errors).toEqual([]);
});

it.each([
	['public', hydrateOnly],
	['compiled', hydrateCompiledComponentRoot]
] as const)(
	'isolates shared lazy hydration from disposal and replacement (%s)',
	async (_name, hydrateEntry) => {
		const { server, client } = await compileCounter();
		let release!: (component: never) => void;
		const pending = new Promise<never>((resolve) => {
			release = resolve;
		});
		let loads = 0;
		let unused = 0;
		const Server = createCompiledComponentRegistry('test:shared-lazy', 'Views', 'server', () => ({
			panel: server.Panel as never
		}));
		const Client = createCompiledComponentRegistry(
			'test:shared-lazy',
			'Views',
			'client',
			({ lazy }) => ({
				panel: lazy(() => {
					loads++;
					return pending;
				}),
				unused: lazy(() => {
					unused++;
					return pending;
				})
			})
		);
		const output = await renderToHydratableString(receipt(Server.panel, {}));
		const first = document.createElement('div'),
			second = document.createElement('div'),
			third = document.createElement('div');
		first.innerHTML = second.innerHTML = third.innerHTML = output.htmlWithHydration;
		const original = second.querySelector('button');
		const a = hydrateEntry(receipt(Client.panel, {}), first);
		const b = hydrateEntry(receipt(Client.panel, {}), second);
		const c = hydrateEntry(receipt(Client.panel, {}), third);
		onTestFinished(() => {
			a.dispose();
			b.dispose();
			c.dispose();
		});
		const cancelled = a.whenSettled();
		a.dispose();
		await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
		// A new explicit root render supersedes the old hydration attempt without awaiting its import.
		hydrateEntry(receipt(client.Panel as never, {}), third);
		await c.whenSettled();
		const replacement = third.querySelector('button');
		expect(third.querySelectorAll('button')).toHaveLength(1);
		replacement!.click();
		await Promise.resolve();
		expect(replacement!.textContent).toBe('Count 1');
		release(client.Panel as never);
		await b.whenSettled();
		expect(loads).toBe(1);
		expect(unused).toBe(0);
		expect(second.querySelector('button')).toBe(original);
		expect(third.querySelector('button')).toBe(replacement);
		second.querySelector('button')!.click();
		await Promise.resolve();
		expect(second.querySelector('button')!.textContent).toBe('Count 1');
		expect(first.hasAttribute('data-exact-hydrated')).toBe(false);
		hydrateEntry(receipt(Client.panel, {}), second);
		expect(second.querySelector('button')).toBe(original);
		expect(original!.textContent).toBe('Count 1');
		original!.click();
		await Promise.resolve();
		expect(original!.textContent).toBe('Count 2');
	}
);

/** Builds a minimal independent component for controlled loader lifecycle checks. */
async function compileCounter() {
	const root = await createTestWorkspace('.exact-registry-owners-', process.cwd());
	const entry = path.join(root, 'panel.tsx');
	await writeFile(
		entry,
		`import {type Component} from '@exactjs/core';export function Panel(this:Component<{count:number}>){this.state.count=0;return ()=> <button onClick={()=>this.state.count++}>Count {this.state.count}</button>;}`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));

	return { server, client };
}

it('fences an island generation replaced during selected-module loading', async () => {
	const { server, client } = await compileCounter();
	let release!: (component: never) => void;
	const pending = new Promise<never>((resolve) => {
		release = resolve;
	});
	const Server = createCompiledComponentRegistry(
		'test:island-generation',
		'Views',
		'server',
		() => ({ panel: server.Panel as never })
	);
	const Client = createCompiledComponentRegistry(
		'test:island-generation',
		'Views',
		'client',
		({ lazy }) => ({ panel: lazy(() => pending) })
	);
	const output = await renderToHydratableString(
		createServerBoundaryReceipt('pending-island', 'Panel', {
			__exactHydration: 'eager',
			__exactHydrationFallback: receipt(Server.panel, {})
		})
	);
	const container = document.createElement('div');
	container.innerHTML = output.htmlWithHydration;
	const view = createExactClient(container, { islands: { Panel: Client.panel } });
	onTestFinished(() => view.dispose());
	const boundary = container.querySelector('[data-exact-client-boundary]')!;
	const original = boundary.querySelector('button');
	boundary.setAttribute('data-exact-client-generation', 'replacement');
	release(client.Panel as never);
	await view.whenSettled();
	expect(boundary.querySelector('button')).toBe(original);
	expect(boundary.hasAttribute('data-exact-client-hydrated')).toBe(false);
	original!.click();
	await Promise.resolve();
	expect(original!.textContent).toBe('Count 0');
});

it.each([false, true])(
	'reports selected-module failure through root readiness (hydrationOnly=%s)',
	async (only) => {
		const { server } = await compileCounter();
		const failure = new Error('selected module unavailable');
		const id = 'test:failed-load:' + only;
		const Server = createCompiledComponentRegistry(id, 'Views', 'server', () => ({
			panel: server.Panel as never
		}));
		const Client = createCompiledComponentRegistry(id, 'Views', 'client', ({ lazy }) => ({
			panel: lazy(() => Promise.reject(failure))
		}));
		const output = await renderToHydratableString(receipt(Server.panel, {}));
		const container = document.createElement('div');
		container.innerHTML = output.htmlWithHydration;
		const original = container.querySelector('button');
		const reports: unknown[] = [];
		const view = (only ? hydrateOnly : hydrate)(receipt(Client.panel, {}), container, {
			logger: { log: (event) => reports.push(event) }
		});
		onTestFinished(() => view.dispose());
		await expect(view.whenSettled()).rejects.toBe(failure);
		expect(reports).toHaveLength(1);
		expect(container.querySelector('button')).toBe(original);
		expect(container.hasAttribute('data-exact-hydrated')).toBe(false);
	}
);

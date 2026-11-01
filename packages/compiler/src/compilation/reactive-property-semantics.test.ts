/** @vitest-environment jsdom */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { materializeExactPhysicalEnhancementFacades } from './physical-enhancement-facades.js';
import { renderToHydratableString as renderEnhancedToHydratableString } from '@exactjs/ssr/enhanced';
import { hydrate as hydrateEnhanced } from '@exactjs/hydrate/enhanced';
import { expect, it, onTestFinished, vi } from 'vitest';
import { testComponent } from '@exactjs/testing';
import { createErrorContext, ErrorContext } from '@exactjs/core';
import type { AnyComponentFunction, Component, RefKey } from '@exactjs/core';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '../../../hydrate/src/index.js';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { createCompilerSession, transformSource, compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
const contributions = [
	{
		name: 'direct properties',
		attributes: `title={attributes(this.state.count).title} disabled={attributes(this.state.count).disabled} style={attributes(this.state.count).style} data-step={this.state.count}`
	},
	{
		name: 'spread before explicit override',
		attributes: `{...attributes(this.state.count)} title={'explicit '+this.state.count}`
	},
	{
		name: 'spread after explicit override',
		attributes: `title="discarded" {...attributes(this.state.count)}`
	}
];
it.each(contributions)(
	'preserves reactive $name, events and retained hydration',
	async ({ name, attributes: props }) => {
		const root = await createCompilerTestWorkspace('.exact-property-semantics-', process.cwd());
		const files = await writeTestFiles(root, {
			'values.ts': `/** @exact pure */ export function attributes(count:number){return {title:count===2?undefined:'value '+count,disabled:count===2,style:{color:count%2?'red':'blue'},'data-step':count};}`,
			'page.tsx': `import {createRef,type Component} from '@exactjs/core';import {attributes} from './values.js';
export const buttonRef=createRef<HTMLButtonElement>('property-button');export let owner:Component<{count:number}>;
export function Page(this:Component<{count:number}>){owner=this;this.state.count=0;return()=> <main><button ${props} ref={this.ref(buttonRef)} onClick={()=>this.state.count++}>{this.state.count}</button><input value={String(this.state.count)} readOnly={this.state.count===2}/></main>;}`
		});
		const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		for (const mode of ['mount', 'hydrate'] as const) {
			const host = document.createElement('div');
			onTestFinished(() => {
				unmount(host);
			});
			const reports: unknown[] = [];
			let original: Element | null = null;
			if (mode === 'hydrate') {
				const output = await renderToHydratableString(receipt(server.Page as never, {}));
				host.innerHTML = output.html;
				original = host.querySelector('button');
				hydrate(receipt(client.Page as never, {}), host, {
					...composeExactComponentContracts([client.Page as AnyComponentFunction], 'client'),
					resumptions: output.resumptions,
					onMismatch: 'throw',
					onErrorReport: (r) => reports.push(r.error)
				});
			} else
				render(receipt(client.Page as never, {}), host, {
					onErrorReport: (r) => reports.push(r.error)
				});
			const button = host.querySelector('button')!;
			const input = host.querySelector('input')!;
			if (original) expect(button).toBe(original);
			const owner = client.owner as Component<{
				count: number;
			}>;
			const ref = owner.ref(client.buttonRef as RefKey<HTMLButtonElement>);
			const state = owner.state;
			for (const count of [0, 1, 2, 3]) {
				if (count === 1) button.click();
				else state.count = count;
				flushSync();
				expect(button.textContent).toBe(String(count));
				expect(button.disabled).toBe(count === 2);
				expect(button.getAttribute('title')).toBe(
					name === 'spread before explicit override'
						? 'explicit ' + count
						: count === 2
							? null
							: 'value ' + count
				);
				expect(button.style.color).toBe(count % 2 ? 'red' : 'blue');
				expect(button.getAttribute('data-step')).toBe(String(count));
				expect(input.value).toBe(String(count));
				expect(input.readOnly).toBe(count === 2);
				expect(host.querySelector('button')).toBe(button);
				expect(ref.current).toBe(button);
				expect(host.querySelector('input')).toBe(input);
			}
			expect(reports).toEqual([]);
			unmount(host);
			expect(host.childNodes).toHaveLength(0);
			expect(ref.current).toBeUndefined();
		}
	}
);
// Inner ref preparation and required dynamic ownership markers must survive paired hydration.
it('adopts an enhanced relationship while retaining its server-reserved inner ref ID', async () => {
	const root = await createCompilerTestWorkspace('.exact-enhanced-ref-identity-', process.cwd());
	const files = await writeTestFiles(root, {
		'page.tsx': `/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes the enhancement namespace in JSX attributes. */
import * as a11y from '@exactjs/accessibility/enhancements' with { type: 'exact-enhancement' };
import { createRef, type Component } from '@exactjs/core';
const helpKey = createRef<HTMLSpanElement>('audit help');
const entryKey = createRef<HTMLInputElement>('audit entry');
/** Exercises optional ref contributions alongside authored intrinsic attributes. */
export function Relationships(this: Component<{}>, props: { enabled: boolean; attrs?: {id?:string} }) {
	const help = this.ref(helpKey);
	return () => (
		<section>
			<button
				aria-controls="authored-controls"
				aria-label="Authored label"
				a11y:described-by={props.enabled ? help : false}
			>
				Action
			</button>
			<span ref={help}>Help</span>
		</section>
	);
}

export { Relationships as Page };
`
	});
	const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const modules: Partial<Record<'client' | 'server', Record<string, unknown>>> = {};
	for (const target of ['client', 'server'] as const) {
		const file = target === 'client' ? artifact!.clientFile : artifact!.serverFile;
		// Paired artifact publication already supplies registrations. Materialize its ordinary provider edge.
		const physical = materializeExactPhysicalEnhancementFacades(
			await readFile(file, 'utf8'),
			artifact![target].rendererEnhancements,
			files['page.tsx']!,
			path.join(root, target),
			target === 'client' ? '@exactjs/dom/framework/enhancements' : undefined,
			file
		);
		await writeFile(file, physical.code);
		modules[target] = await importArtifact(file, path.join(root, target + '.mjs'));
	}
	const reports: unknown[] = [],
		hydration: unknown[] = [];
	const logger = {
		log(event: { level: string }) {
			if (event.level === 'warn' || event.level === 'error') reports.push(event);
		}
	};
	const props = { enabled: true, attrs: { id: 'from-spread' } };
	// Default hydratable policy preserves dynamic child boundaries, even for an unmarked outer root.
	const output = await renderEnhancedToHydratableString(
		receipt(modules.server!.Page as AnyComponentFunction, props),
		{ logger }
	);
	const host = document.createElement('div');
	host.innerHTML = output.html;
	document.body.append(host);
	let mounted: ReturnType<typeof hydrateEnhanced> | undefined, primary: unknown;
	try {
		const original = host.querySelector('span')!,
			button = host.querySelector('button')!,
			id = original.id;
		expect(id).toBeTruthy();
		expect(button.getAttribute('aria-describedby')).toBe(id);
		mounted = hydrateEnhanced(receipt(modules.client!.Page as AnyComponentFunction, props), host, {
			...composeExactComponentContracts([modules.client!.Page as AnyComponentFunction], 'client'),
			resumptions: output.resumptions,
			onMismatch: 'throw',
			logger,
			onHydration: (event) => hydration.push(event),
			onDiagnostic: (event) => reports.push(event),
			onErrorReport: (event) => reports.push(event)
		});
		await mounted.whenSettled();
		expect(host.querySelector('span')).toBe(original);
		expect(original.id).toBe(id);
		expect(button.getAttribute('aria-describedby')).toBe(id);
		expect(hydration).toContainEqual({ kind: 'root', outcome: 'adopted', markers: 'exact' });
		expect(reports).toEqual([]);
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		try {
			if (mounted) {
				mounted.dispose();
				expect(host.childElementCount).toBe(0);
			}
		} catch (cleanup) {
			if (primary) console.error('Cleanup after primary', cleanup);
			else throw cleanup;
		} finally {
			host.remove();
		}
	}
});
// The island has a private input parameter. It must not capture a module symbol
// with the same authored base name. State setup here is CLIENT-local, not an SSR snapshot.
it.each(['key', 'props'])(
	'retains module symbol %s across original and island tasks',
	async (name) => {
		const root = await createCompilerTestWorkspace('.exact-symbol-task-', process.cwd());
		const source =
			`import {TaskContext,type Component} from '@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<{[key]:number}>){this.state[key]=0;const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();this.state[key]+=1;};return()=> <button onClick={()=>run()}/>;}`.replaceAll(
				'key',
				name
			);
		const files = await writeTestFiles(root, { 'probe.tsx': source });
		const session = createCompilerSession();
		let code: string;
		try {
			code = transformSource(source, {
				filename: files['probe.tsx']!,
				target: 'client',
				serverComponents: true,
				componentContractProjection: 'hydrate',
				generatedValidation: 'semantic',
				session
			}).code;
		} finally {
			session.dispose();
		}
		const output = path.join(root, 'probe.exact.client.ts');
		await writeFile(output, code);
		const module = await importArtifact(output, path.join(root, 'client.mjs'));
		const reports = createErrorContext();
		const warnings = vi.spyOn(console, 'warn');
		const errors = vi.spyOn(console, 'error');
		let warningCalls: unknown[] = [];
		let errorCalls: unknown[] = [];
		const views: Awaited<ReturnType<ReturnType<typeof testComponent>['mount']>>[] = [];
		let primary: unknown;
		try {
			const original = await testComponent(module.Probe as AnyComponentFunction)
				.context(ErrorContext, reports)
				.mount();
			views.push(original);
			const symbols = Object.getOwnPropertySymbols(original.root.state());
			expect(symbols).toHaveLength(1);
			const symbol = symbols[0]!;
			expect(Reflect.get(original.root.state(), symbol)).toBe(0);
			const islands = Object.keys(module).filter((key) => key.startsWith('Probe_ExactClient_'));
			expect(islands).toHaveLength(1);
			const island = await testComponent(module[islands[0]!] as AnyComponentFunction)
				.context(ErrorContext, reports)
				.mount();
			views.push(island);
			Reflect.set(island.root.state(), symbol, 0);
			for (const view of views) {
				const state = view.root.state();
				const button = view.container.querySelector('button');
				expect(Reflect.get(state, symbol)).toBe(0);
				await view.root.getByRole('button').click();
				expect(view.root.state()).toBe(state);
				expect(Object.getOwnPropertySymbols(state)).toContain(symbol);
				expect(Reflect.get(state, symbol)).toBe(1);
				expect(Object.keys(state)).toEqual([]);
				expect(view.container.querySelector('button')).toBe(button);
			}
			expect(reports.errors).toEqual([]);
		} catch (caught) {
			primary = caught;
			throw caught;
		} finally {
			const failures: unknown[] = [];
			for (const view of views.reverse()) {
				try {
					view.unmount();
				} catch (caught) {
					failures.push(caught);
				}
			}
			warningCalls = warnings.mock.calls.map((args) => [...args]);
			errorCalls = errors.mock.calls.map((args) => [...args]);
			warnings.mockRestore();
			errors.mockRestore();
			if (!primary && failures.length) throw failures[0];
		}
		for (const view of views) {
			expect(view.root.instance.mounted).toBe(false);
			expect(view.container.childNodes).toHaveLength(0);
		}
		expect(reports.errors).toEqual([]);
		expect(warningCalls).toEqual([]);
		expect(errorCalls).toEqual([]);
	}
);
// Supplied-target attributes consume host expressions while component inputs retain raw operands.
it('updates supplied-target attributes while retaining the supplied node', async () => {
	const root = await createCompilerTestWorkspace('.exact-supplied-target-props-', process.cwd());
	const files = await writeTestFiles(root, {
		'page.tsx': `import {type Component,type Child} from '@exactjs/core';
function Receiver(this:Component<{}>,props:{value:string;children?:Child|Child[]}){
 const value=props.value;return()=> <_target data-result={value}/>;
}
export function Page(this:Component<{value:string}>){
 this.state.value='first';return()=> <Receiver value={this.state.value}><span>owned</span></Receiver>;
}`
	});
	const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const reports = createErrorContext();
	const view = await testComponent(client.Page as AnyComponentFunction)
		.context(ErrorContext, reports)
		.mount();
	try {
		const span = view.container.querySelector('span');
		const state = view.root.state();
		expect(span?.getAttribute('data-result')).toBe('first');
		expect(span?.textContent).toBe('owned');
		await view.root.setState({ value: 'next' });
		expect(view.container.querySelector('span')).toBe(span);
		expect(span?.getAttribute('data-result')).toBe('next');
		expect(view.root.state()).toBe(state);
		expect(reports.errors).toEqual([]);
	} finally {
		await view.unmount();
	}
	expect(view.container.childNodes).toHaveLength(0);
});

/** @vitest-environment jsdom */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { unmount } from '@exactjs/dom';
import { hydrate, hydrateClientIslands } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { ExactCompilerSession } from '../expression/project.js';
import { nativeModuleAnalysis } from '../native/module-analysis.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompilerTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { createArtifactBuildProducts } from './build-products.js';

it('selectively hydrates a provider and its descendant command under one owner', async () => {
	const root = await createCompilerTestWorkspace('.exact-provider-hydration-', process.cwd());
	const source = `import {createContext,type Component} from '@exactjs/core';
const Control=createContext<{count:number;increment():void}>('control');
export function Child(this:Component<{}>){const ctx=this.getContext(Control);
	return()=> <button onClick={()=>ctx.increment()}>{ctx.count}</button>}
export function Provider(this:Component<{count:number}>,props:{initial:number}){
	this.state.count=props.initial;
	const state=this.state;
	this.setContext(Control,{get count(){return state.count},increment(){state.count++}});
	return()=> <section data-count={this.state.count}><Child/></section>}
export function Literal(){return()=> <Provider initial={1}/>}
export function ServerPage(){return()=> <main data-platform={process.platform}><Provider initial={1}/></main>}
export function Spread(props:{input:{initial:number}}){return()=> <Provider {...props.input}/>}
export function Read(props:{input:{initial:number}}){return()=> <Provider initial={props.input.initial}/>}`;
	await writeTestFiles(root, {
		'page.tsx': source,
		'tsconfig.json': JSON.stringify({
			compilerOptions: {
				strict: true,
				types: ['node'],
				jsx: 'preserve',
				jsxImportSource: '@exactjs/jsx',
				target: 'ES2022',
				module: 'ESNext',
				moduleResolution: 'Bundler'
			},
			files: ['page.tsx']
		})
	});
	const filename = path.join(root, 'page.tsx');
	const session = new ExactCompilerSession();
	onTestFinished(() => session.dispose());
	const modules: Partial<Record<'client' | 'server', Record<string, AnyComponentFunction>>> = {};
	const registry: Record<string, AnyComponentFunction> = {};
	for (const target of ['server', 'client'] as const) {
		const result = session.compileNative({
			kind: 'compile',
			target,
			componentContractProjection: target === 'client' ? 'hydrate' : 'server-render',
			root,
			configFile: path.join(root, 'tsconfig.json'),
			source,
			id: filename,
			serverComponents: true,
			diagnostics: 'semantic'
		});
		expect(result.diagnostics).toEqual([]);
		expect(result.error).toBeUndefined();
		expect(result.analysis.components.find((c) => c.name === 'Provider')).toMatchObject({
			placement: 'unknown'
		});
		const records = createArtifactBuildProducts(
			filename,
			nativeModuleAnalysis(filename, result)
		).clientRegistrations;
		const providers = result.analysis.components
			.filter((c) => ['Provider', 'Read'].includes(c.name))
			.map((c) => c.id);
		expect(records.filter((row) => row.componentId && providers.includes(row.componentId))).toEqual(
			[]
		);
		const compiled = path.join(root, target + '.tsx');
		await writeFile(compiled, result.code!);
		const exports = (await importArtifact(compiled, path.join(root, target + '.mjs'))) as Record<
			string,
			AnyComponentFunction
		>;
		modules[target] = exports;
		if (target === 'client')
			for (const row of records) {
				expect(typeof exports[row.exportName]).toBe('function');
				registry[row.name] = exports[row.exportName]!;
			}
	}
	for (const [name, props] of [
		['Literal', {}],
		['ServerPage', {}],
		['Spread', { input: { initial: 1 } }]
	] as const) {
		const server = await renderToHydratableString(
			createCompiledComponentInputReceipt(modules.server![name]!, props),
			{ clientResumptionOwner: false }
		);
		const host = document.createElement('div');
		host.innerHTML = server.htmlWithHydration;
		expect(host.querySelectorAll('[data-exact-client-boundary]')).toHaveLength(1);
		const boundary = host.querySelector('[data-exact-client-boundary]')!;
		onTestFinished(() => unmount(boundary));
		const button = host.querySelector('button')!;
		expect(button.textContent).toBe('1');
		hydrateClientIslands(host, registry);
		expect(host.querySelector('button')).toBe(button);
		button.click();
		await expect.poll(() => host.querySelector('section')?.dataset.count).toBe('2');
		button.click();
		await expect.poll(() => host.querySelector('section')?.dataset.count).toBe('3');
		expect(host.querySelector('button')).toBe(button);
	}
	const fullRoot = document.createElement('div');
	const rendered = await renderToHydratableString(
		createCompiledComponentInputReceipt(modules.server!.Literal!, {})
	);
	fullRoot.innerHTML = rendered.html;
	expect(fullRoot.querySelector('[data-exact-client-boundary]')).toBeNull();
	const originalButton = fullRoot.querySelector('button')!;
	const view = hydrate(
		createCompiledComponentInputReceipt(modules.client!.Literal!, {}),
		fullRoot,
		{ onMismatch: 'throw' }
	);
	try {
		expect(fullRoot.querySelector('button')).toBe(originalButton);
		originalButton.click();
		await expect.poll(() => fullRoot.querySelector('section')?.dataset.count).toBe('2');
	} finally {
		view.dispose();
	}
});

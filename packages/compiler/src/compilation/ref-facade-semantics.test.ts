/** @vitest-environment jsdom */
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString, renderToString } from '@exactjs/ssr';
import { render, dispose } from '@exactjs/dom';
import { compileFileArtifacts } from '../index.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import ts from 'typescript';

it('retains an extracted lifecycle operation alongside a later ref lookup', async () => {
	const workspace = await createCompilerTestWorkspace('component-surface-', process.cwd());
	const input = path.join(workspace, 'page.tsx');
	await writeFile(
		input,
		`import {createRef,type Component} from '@exactjs/core';
const token=createRef<{label:string}>('value');
export function Page(this:Component<{label:string}>) {
	this.state.label='starting';
	const register=this.onMount;
	this.ref(token).fulfill({label:'mounted'});
	const refs=this.refs;
	register.call(this,()=>{this.state.label=refs.get(token)?.label??'missing'});
	return()=> <output>{this.state.label}</output>;
}`
	);
	const artifact = await compileFileArtifacts(input, {
		rootDir: workspace,
		outDir: path.join(workspace, 'generated')
	});
	const server = await importArtifact(artifact.serverFile, path.join(workspace, 'server.mjs'));
	expect(
		(await renderToString(receipt(server.Page as AnyComponentFunction, {}), { markers: false }))
			.html
	).toBe('<output>starting</output>');

	const client = await importArtifact(artifact.clientFile, path.join(workspace, 'client.mjs'));
	const host = document.createElement('div');
	onTestFinished(() => dispose(host));
	const errors: unknown[] = [];
	render(receipt(client.Page as AnyComponentFunction, {}), host, {
		onErrorReport: (report) => errors.push(report.error)
	});
	await expect.poll(() => host.textContent).toBe('mounted');
	expect(errors).toEqual([]);
});

it('adopts computed lifecycle and ref selections and retains reactive updates', async () => {
	const workspace = await createCompilerTestWorkspace('computed-component-surface-', process.cwd());
	const input = path.join(workspace, 'page.tsx');
	await writeFile(
		input,
		`import {createRef,type Component} from '@exactjs/core';
export const events:string[]=[];
const reactive='reactive' as const;
const ref='ref' as const;
const token=createRef<HTMLButtonElement>('counter');
function key(){ events.push('key'); return 'onMount' as const; }
function Child(this:Component<{label:string;count:number}>,props:{operation:'onMount'}) {
	this.state.label='starting';
	this.state.count=1;
	this[props.operation](()=>{this.state.label='mounted'});
	const callback=()=>{events.push(this.refs.get(token)?.id??'missing');};
	this[key()](callback);
	const acquire=this[reactive];
	const value=acquire(()=>this.state.count+1);
	const binding=this[ref]?.(token);
	return()=> <section><p>{this.state.label}</p><button id="counter" ref={binding} onClick={()=>this.state.count++}>{value.get()}</button></section>;
}
export function Page(){return()=> <Child operation="onMount"/>}`
	);
	const artifact = await compileFileArtifacts(input, {
		rootDir: workspace,
		outDir: path.join(workspace, 'generated')
	});
	const server = await importArtifact(artifact.serverFile, path.join(workspace, 'server.mjs'));
	const output = await renderToHydratableString(receipt(server.Page as AnyComponentFunction, {}));
	expect(output.html).toContain('<p>starting</p>');
	expect(server.events).toEqual(['key']);

	const client = await importArtifact(artifact.clientFile, path.join(workspace, 'client.mjs'));
	const root = document.createElement('div');
	root.innerHTML = output.html;
	const button = root.querySelector('button')!;
	const errors: unknown[] = [];
	const component = client.Page as AnyComponentFunction;
	const view = hydrate(receipt(component, {}), root, {
		...composeExactComponentContracts([component], 'client'),
		resumptions: output.resumptions,
		onMismatch: 'throw',
		onErrorReport: (report) => errors.push(report.error)
	});
	try {
		expect(root.querySelector('button')).toBe(button);
		await expect.poll(() => root.querySelector('p')?.textContent).toBe('mounted');
		expect(client.events).toEqual(['key', 'counter']);
		expect(button.textContent).toBe('2');
		button.click();
		await expect.poll(() => button.textContent).toBe('3');
		expect(errors).toEqual([]);
	} finally {
		view.dispose();
	}
});

for (const access of ['direct', 'literal', 'extracted', 'binding', 'root'] as const)
	it(`retains keyed ref values in strict TypeScript through ${access} access`, async () => {
		await mkdir(path.resolve('.tmp'), { recursive: true });
		const workspace = await createCompilerTestWorkspace('ref-generics-', path.resolve('.tmp'));
		const input = path.join(workspace, 'page.tsx');
		const expression =
			access === 'direct'
				? 'this.refs.get(key)?.value'
				: access === 'literal'
					? "this.refs['get'](key)?.value"
					: access === 'extracted'
						? 'read(key)?.value'
						: access === 'binding'
							? 'binding.current?.value'
							: 'this.refs.root(binding).current?.value';
		await writeFile(
			input,
			`import {createRef,type Component} from '@exactjs/core';const key=createRef<{value:string}>('value');export function Page(this:Component<{}>){const acquire=this.ref.bind(this);const read=this.refs.get.bind(this.refs);const binding=acquire(key);binding.fulfill({value:'ready'});return()=> <output>{${expression}}</output>;}`
		);
		const options: ts.CompilerOptions = {
			noEmit: true,
			strict: true,
			skipLibCheck: true,
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			jsx: ts.JsxEmit.ReactJSX,
			jsxImportSource: '@exactjs/jsx'
		};
		const check = (filename: string) =>
			ts
				.getPreEmitDiagnostics(ts.createProgram([filename], options))
				.map(
					(diagnostic) =>
						`${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
				);
		expect(check(input)).toEqual([]);
		const artifact = await compileFileArtifacts(input, {
			rootDir: workspace,
			outDir: path.join(workspace, 'generated'),
			serverComponents: true
		});
		expect(check(artifact.clientFile)).toEqual([]);
		expect(check(artifact.serverFile)).toEqual([]);
		const server = await importArtifact(artifact.serverFile, path.join(workspace, 'server.mjs'));
		expect((await renderToString(receipt(server.Page as AnyComponentFunction, {}))).html).toContain(
			'<output>ready</output>'
		);
		const client = await importArtifact(artifact.clientFile, path.join(workspace, 'client.mjs'));
		const host = document.createElement('div');
		onTestFinished(() => {
			dispose(host);
		});
		render(receipt(client.Page as AnyComponentFunction, {}), host);
		expect(host.textContent).toBe('ready');
	});
for (const access of ['direct', 'literal', 'extracted'] as const)
	it(`preserves replaced ref get through ${access} dispatch`, async () => {
		await mkdir(path.resolve('.tmp'), { recursive: true });
		const workspace = await createCompilerTestWorkspace('ref-facade-', path.resolve('.tmp'));
		const input = path.join(workspace, 'page.tsx');
		const read =
			access === 'direct'
				? 'this.refs.get(key)'
				: access === 'literal'
					? "this.refs['get'](key)"
					: 'refs.get(key)';
		await writeFile(
			input,
			`import {createRef,type Component} from '@exactjs/core';const key=createRef<object>('value');function change(refs:Component<{}>['refs']):string{refs.get=()=>undefined;return '';}export function Page(this:Component<{}>){const refs=this.refs;const binding=this.ref(key);binding.fulfill({});return()=> <output>{change(refs)}{String(${read}===undefined)}</output>;}`
		);
		const artifact = await compileFileArtifacts(input, {
			rootDir: workspace,
			outDir: path.join(workspace, 'generated'),
			serverComponents: true
		});
		const server = await importArtifact(artifact.serverFile, path.join(workspace, 'server.mjs'));
		expect((await renderToString(receipt(server.Page as AnyComponentFunction, {}))).html).toContain(
			'<output>true</output>'
		);
		const client = await importArtifact(artifact.clientFile, path.join(workspace, 'client.mjs'));
		const host = document.createElement('div');
		onTestFinished(() => {
			dispose(host);
		});
		render(receipt(client.Page as AnyComponentFunction, {}), host);
		expect(host.textContent).toBe('true');
	});
it('preserves replaced root facade while canonical readRef retains binding semantics', async () => {
	await mkdir(path.resolve('.tmp'), { recursive: true });
	const workspace = await createCompilerTestWorkspace('ref-root-dispatch-', path.resolve('.tmp'));
	const input = path.join(workspace, 'page.tsx');
	await writeFile(
		input,
		`import {createRef,type Component} from '@exactjs/core';const key=createRef<object>('value');function change(refs:Component<{}>['refs']):string{refs.root=(()=>({current:undefined,generation:42,introduction:undefined,presented:false,release:undefined})) as typeof refs.root;return '';}export function Page(this:Component<{}>){const refs=this.refs;const binding=this.ref(key);binding.fulfill({});return()=> <output>{change(refs)}{String(this.refs.root().generation===42)}:{String(this.readRef(key)!==undefined)}</output>;}`
	);
	const artifact = await compileFileArtifacts(input, {
		rootDir: workspace,
		outDir: path.join(workspace, 'generated'),
		serverComponents: true
	});
	const server = await importArtifact(artifact.serverFile, path.join(workspace, 'server.mjs'));
	expect((await renderToString(receipt(server.Page as AnyComponentFunction, {}))).html).toContain(
		'<output>true:true</output>'
	);
	const client = await importArtifact(artifact.clientFile, path.join(workspace, 'client.mjs'));
	const host = document.createElement('div');
	onTestFinished(() => {
		dispose(host);
	});
	render(receipt(client.Page as AnyComponentFunction, {}), host);
	expect(host.textContent).toBe('true:true');
});

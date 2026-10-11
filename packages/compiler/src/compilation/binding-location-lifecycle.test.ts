/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

// Bindings retain writable state, node identity and cleanup across equivalent source wrappers.
it.each(
	[
		'this.state.value',
		'(this.state.value)',
		'(this.state.value as string)',
		'(this.state.value satisfies string)',
		'this.state.value!'
	].flatMap((expression) => ['mount', 'hydrate'].map((mode) => ({ expression, mode })))
)('updates wrapped bindings $expression in $mode', async ({ expression, mode }) => {
	const root = await createTestWorkspace('.exact-binding-location-', process.cwd());
	const files = await writeTestFiles(root, {
		'form.tsx': `import type {Component} from '@exactjs/core';export let owner:Component<{value:string}>;function Control(props:{value:string;changed:(value:string,reason:number)=>void}){return()=> <input data-notify value={props.value} onInput={event=>props.changed(event.currentTarget.value,1)}/>}export function Form(this:Component<{value:string}>){owner=this;this.state.value='initial';return()=> <section><input data-native value:onInput={${expression}}/><Control value:changed={${expression}}/><p>{this.state.value}</p></section>}export const formRoot=()=> <Form/>`
	});
	const [artifact] = await compileProjectArtifacts([files['form.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const formRoot = client.formRoot as () => Parameters<typeof render>[0];
	const host = document.createElement('div');
	onTestFinished(() => {
		unmount(host);
	});
	const reports: unknown[] = [];
	if (mode === 'hydrate') {
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const output = await renderToHydratableString(
			(server.formRoot as () => Parameters<typeof renderToHydratableString>[0])()
		);
		host.innerHTML = output.html;
		const adopted = [...host.querySelectorAll('input')];
		hydrate(formRoot(), host, {
			resumptions: output.resumptions,
			onMismatch: 'throw',
			onErrorReport: (r) => reports.push(r.error)
		});
		expect(host.querySelectorAll('input')[0]).toBe(adopted[0]);
		expect(host.querySelectorAll('input')[1]).toBe(adopted[1]);
	} else render(formRoot(), host, { onErrorReport: (r) => reports.push(r.error) });
	flushSync();
	const owner = client.owner as { state: { value: string } };
	const native = host.querySelector<HTMLInputElement>('[data-native]')!;
	const notify = host.querySelector<HTMLInputElement>('[data-notify]')!;
	expect(native.value).toBe('initial');
	expect(notify.value).toBe('initial');
	owner.state.value = 'retained';
	flushSync();
	expect(host.querySelector('[data-native]')).toBe(native);
	expect(host.querySelector('[data-notify]')).toBe(notify);
	expect(native.value).toBe('retained');
	expect(notify.value).toBe('retained');
	native.value = 'native';
	native.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
	expect(owner.state.value).toBe('native');
	expect(notify.value).toBe('native');
	notify.value = 'notification';
	notify.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
	expect(owner.state.value).toBe('notification');
	expect(native.value).toBe('notification');
	unmount(host);
	native.value = 'disposed';
	native.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
	expect(owner.state.value).toBe('notification');
	expect(reports).toEqual([]);
});

// A fresh copy keeps writable object semantics after its receiver becomes a derived cell.
it.each(['mount', 'hydrate'])(
	'writes a derived copy without changing props in %s',
	async (mode) => {
		const root = await createTestWorkspace('.exact-binding-copy-', process.cwd());
		const files = await writeTestFiles(root, {
			'form.tsx': `import type {Component} from '@exactjs/core';export let owner:Component<{observed:string}>;export function Form(this:Component<{observed:string}>,props:{nested:{value:string}}){owner=this;this.state.observed='';const copy={...props.nested};return()=> <section><input value:onInput={copy.value}/><button onClick={()=>this.state.observed=copy.value}>Read</button><p>{this.state.observed}</p></section>}export const formRoot=(nested:{value:string})=> <Form nested={nested}/>`
		});
		const [artifact] = await compileProjectArtifacts([files['form.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const formRoot = client.formRoot as (nested: { value: string }) => Parameters<typeof render>[0];
		const host = document.createElement('div');
		onTestFinished(() => {
			unmount(host);
		});
		const reports: unknown[] = [];
		const initial = { value: 'initial' };
		if (mode === 'hydrate') {
			const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
			const output = await renderToHydratableString(
				(
					server.formRoot as (
						nested: typeof initial
					) => Parameters<typeof renderToHydratableString>[0]
				)(initial)
			);
			host.innerHTML = output.html;
			const adopted = host.querySelector('input');
			hydrate(formRoot(initial), host, {
				resumptions: output.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r.error)
			});
			expect(host.querySelector('input')).toBe(adopted);
		} else render(formRoot(initial), host, { onErrorReport: (r) => reports.push(r.error) });
		const input = host.querySelector('input')!;
		const button = host.querySelector('button')!;
		input.value = 'edited';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		button.click();
		flushSync();
		expect((client.owner as { state: { observed: string } }).state.observed).toBe('edited');
		expect(initial.value).toBe('initial');
		const next = { value: 'next' };
		render(formRoot(next), host);
		flushSync();
		expect(host.querySelector('input')).toBe(input);
		expect(input.value).toBe('next');
		input.value = 'second';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		button.click();
		flushSync();
		expect((client.owner as { state: { observed: string } }).state.observed).toBe('second');
		expect(next.value).toBe('next');
		unmount(host);
		expect(reports).toEqual([]);
	}
);

// Computed locations select the current state member on each receipt and preserve sibling state.
it.each(['mount', 'hydrate'])('writes asserted computed locations in %s', async (mode) => {
	const root = await createTestWorkspace('.exact-binding-computed-', process.cwd());
	const files = await writeTestFiles(root, {
		'form.tsx': `import type {Component} from '@exactjs/core';type State={fields:{value:string}[];index:number};export let owner:Component<State>;function Control(props:{value:string;changed:(value:string)=>void}){return()=> <input data-notify value={props.value} onInput={event=>props.changed(event.currentTarget.value)}/>}export function Form(this:Component<State>){owner=this;this.state.fields=[{value:'A'},{value:'B'}];this.state.index=0;return()=> <section><input data-native value:onInput={(this.state.fields[this.state.index].value as string)}/><Control value:changed={(this.state.fields[this.state.index].value as string)}/><button onClick={()=>{(this.state.fields[this.state.index].value as string)='cast'}}>Cast</button></section>}export const formRoot=()=> <Form/>`
	});
	const [artifact] = await compileProjectArtifacts([files['form.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const formRoot = client.formRoot as () => Parameters<typeof render>[0];
	const host = document.createElement('div');
	onTestFinished(() => {
		unmount(host);
	});
	const reports: unknown[] = [];
	if (mode === 'hydrate') {
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const output = await renderToHydratableString(
			(server.formRoot as () => Parameters<typeof renderToHydratableString>[0])()
		);
		host.innerHTML = output.html;
		const adopted = host.querySelector('input');
		hydrate(formRoot(), host, {
			resumptions: output.resumptions,
			onMismatch: 'throw',
			onErrorReport: (r) => reports.push(r.error)
		});
		expect(host.querySelector('input')).toBe(adopted);
	} else render(formRoot(), host, { onErrorReport: (r) => reports.push(r.error) });
	const state = (client.owner as { state: { fields: { value: string }[]; index: number } }).state;
	const native = host.querySelector<HTMLInputElement>('[data-native]')!;
	const notify = host.querySelector<HTMLInputElement>('[data-notify]')!;
	expect(native.value).toBe('A');
	state.index = 1;
	flushSync();
	expect(host.querySelector('[data-native]')).toBe(native);
	expect(native.value).toBe('B');
	expect(notify.value).toBe('B');
	native.value = 'native';
	native.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
	expect(state.fields[1]!.value).toBe('native');
	expect(notify.value).toBe('native');
	notify.value = 'notification';
	notify.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
	expect(state.fields[1]!.value).toBe('notification');
	expect(native.value).toBe('notification');
	host.querySelector('button')!.click();
	flushSync();
	expect(state.fields[1]!.value).toBe('cast');
	expect(state.fields[0]!.value).toBe('A');
	state.index = 0;
	flushSync();
	expect(native.value).toBe('A');
	unmount(host);
	expect(reports).toEqual([]);
});

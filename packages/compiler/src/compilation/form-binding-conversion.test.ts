/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { Component } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { compileFileArtifacts } from '../index.js';
import { transformSource } from './transformation.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(['radio', 'string radio', 'default radio', 'numeric text'] as const)(
	'preserves %s conversion in both binding directions',
	async (control) => {
		const root = await createTestWorkspace('.exact-form-conversion-', process.cwd());
		const body =
			control === 'default radio'
				? `<input type={"radio"} name="choice" checked:onChange={this.state.value}/><input type="radio" name="choice" value={3} checked:onChange={this.state.value}/>`
				: control.includes('radio')
					? `<input type="radio" name="choice" value="2" checked:onChange={this.state.value}/><input type="radio" name="choice" value={3} checked:onChange={this.state.value}/>`
					: `<input type="text" value:onInput={this.state.value}/><input type="number" value:onInput={this.state.value}/><textarea value:onChange={this.state.value}/>`;
		const kind =
			control === 'string radio' || control === 'default radio' ? 'string' : 'number|null';
		const initial = control === 'default radio' ? "'on'" : control === 'string radio' ? "'2'" : '2';
		const expected = (value: number) =>
			control === 'default radio' && value === 2
				? 'on'
				: control.includes('radio') && control !== 'radio'
					? String(value)
					: value;
		const files = await writeTestFiles(root, {
			'form.tsx': `import {type Component} from '@exactjs/core';
export let owner:Component<{value:${kind}}>;
export function Form(this:Component<{value:${kind}}>){owner=this;this.state.value=${initial};
return()=> <section>${body}<output>{this.state.value}</output></section>;}`
		});
		const compiled = await compileFileArtifacts(files['form.tsx']!, {
			rootDir: root,
			outDir: root
		});
		const client = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
		const server = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
		for (const mode of ['mount', 'hydrate']) {
			const host = document.createElement('div');
			const reports: unknown[] = [];
			onTestFinished(() => {
				unmount(host);
			});
			if (mode === 'hydrate') {
				const result = await renderToHydratableString(receipt(server.Form as never, {}));
				host.innerHTML = result.html;
				const original = host.querySelector('input');
				hydrate(receipt(client.Form as never, {}), host, {
					resumptions: result.resumptions,
					onMismatch: 'throw',
					onErrorReport: (r) => reports.push(r)
				});
				expect(host.querySelector('input')).toBe(original);
			} else
				render(receipt(client.Form as never, {}), host, { onErrorReport: (r) => reports.push(r) });
			const owner = client.owner as Component<{ value: number | string | null }>;
			const inputs = [...host.querySelectorAll('input')];
			expect(inputs).toHaveLength(2);
			if (control.includes('radio')) {
				expect(inputs.map((input) => input.checked)).toEqual([true, false]);
				inputs[1]!.checked = true;
				inputs[1]!.dispatchEvent(new Event('change', { bubbles: true }));
				flushSync();
				expect(owner.state.value).toBe(expected(3));
				expect(inputs.map((input) => input.checked)).toEqual([false, true]);
				owner.state.value = expected(2);
				flushSync();
				expect(inputs.map((input) => input.checked)).toEqual([true, false]);
				inputs[0]!.checked = false;
				inputs[0]!.dispatchEvent(new Event('change', { bubbles: true }));
				flushSync();
				expect(owner.state.value).toBe(expected(2));
				inputs[1]!.checked = true;
				inputs[1]!.dispatchEvent(new Event('change', { bubbles: true }));
				flushSync();
				expect(owner.state.value).toBe(expected(3));
			} else {
				for (const input of inputs) {
					input.value = '7';
					input.dispatchEvent(new Event('input', { bubbles: true }));
					flushSync();
					expect(owner.state.value).toBe(7);
					owner.state.value = expected(2);
					flushSync();
					expect(input.value).toBe('2');
				}
				const textarea = host.querySelector('textarea')!;
				textarea.value = '8';
				textarea.dispatchEvent(new Event('change', { bubbles: true }));
				flushSync();
				expect(owner.state.value).toBe(8);
				inputs[0]!.value = '';
				inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }));
				flushSync();
				expect(owner.state.value).toBeNull();
				expect(inputs[1]!.value).toBe('');
				inputs[0]!.value = '9';
				inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }));
				flushSync();
				expect(owner.state.value).toBe(9);
			}
			expect([...host.querySelectorAll('input')]).toEqual(inputs);
			expect(reports).toEqual([]);
			unmount(host);
			expect(host.childNodes).toHaveLength(0);
			const settled = owner.state.value;
			inputs[0]!.value = '12';
			inputs[0]!.checked = true;
			inputs[0]!.dispatchEvent(
				new Event(control.includes('radio') ? 'change' : 'input', { bubbles: true })
			);
			flushSync();
			expect(owner.state.value).toBe(settled);
		}
	}
);

it('preserves native numeric APIs when an input type changes', async () => {
	const root = await createTestWorkspace('.exact-form-dynamic-type-', process.cwd());
	const files = await writeTestFiles(root, {
		'form.tsx': `import {type Component} from '@exactjs/core';
 export let owner:Component<{value:number|null;type:string}>;
 export function Form(this:Component<{value:number|null;type:string}>){owner=this;this.state.value=2;this.state.type='text';return()=> <input type={this.state.type} value:onChange={this.state.value}/>;}`
	});
	const compiled = await compileFileArtifacts(files['form.tsx']!, { rootDir: root, outDir: root });
	const client = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
	const host = document.createElement('div');
	const reports: unknown[] = [];
	onTestFinished(() => {
		unmount(host);
	});
	render(receipt(client.Form as never, {}), host, { onErrorReport: (r) => reports.push(r) });
	const owner = client.owner as Component<{ value: number | null; type: string }>;
	const input = host.querySelector('input')!;
	for (const [type, value, expected] of [
		['text', '7', 7],
		['number', '8', 8],
		['date', '2026-01-02', Date.UTC(2026, 0, 2)],
		['text', '9', 9]
	] as const) {
		owner.state.type = type;
		flushSync();
		input.value = value;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(owner.state.value).toBe(expected);
		expect(host.querySelector('input')).toBe(input);
	}
	input.value = '';
	input.dispatchEvent(new Event('change', { bubbles: true }));
	flushSync();
	expect(owner.state.value).toBeNull();
	expect(reports).toEqual([]);
});

it.each(['number', 'string', 'Date'])(
	'rejects scalar %s checkbox bindings before emission',
	(kind) => {
		expect(() =>
			transformSource(
				`declare class Component<S>{state:S} export function Form(this:Component<{value:${kind}}>){return()=> <input type="checkbox" checked:onChange={this.state.value}/>;}`,
				{ filename: path.resolve('src/fixtures/invalid-checkbox.tsx') }
			)
		).toThrow(/checked:onChange requires a boolean/);
	}
);

it.each(['intrinsic', 'component'] as const)(
	'checks readonly %s binding targets with native TypeScript rules',
	(mode) => {
		const prefix = `declare class Component<S>{state:S} declare function Input(p:{value:string;change(value:string):void}):()=>unknown;`;
		const control =
			mode === 'intrinsic'
				? `<input value:onInput={this.state.value}/>`
				: `<Input value:change={this.state.value}/>`;
		expect(() =>
			transformSource(
				prefix +
					`export function Form(this:Component<{readonly value:string}>){return()=> ${control};}`,
				{
					filename: path.resolve('src/fixtures/readonly-binding.tsx'),
					generatedValidation: 'semantic'
				}
			)
		).toThrow(/read-only property/);
		const nested = control.replace('this.state.value', 'this.state.box.value');
		expect(() =>
			transformSource(
				prefix +
					`export function Form(this:Component<{readonly box:{value:string}}>){return()=> ${nested};}`,
				{
					filename: path.resolve('src/fixtures/mutable-leaf-binding.tsx'),
					generatedValidation: 'semantic'
				}
			)
		).not.toThrow();
	}
);

it.each(['props.value', 'props.record.value', 'alias.value'] as const)(
	'rejects binding into parent-owned %s',
	(target) => {
		const source = `export function Form(props:{value:string;record:{value:string}}){const alias=props;return()=> <input value:onInput={${target}}/>;}`;
		expect(() =>
			transformSource(source, { filename: path.resolve('src/fixtures/props-binding.tsx') })
		).toThrow(/cannot write parent-owned props/);
	}
);

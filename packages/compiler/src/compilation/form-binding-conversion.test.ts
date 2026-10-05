/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { Component } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString, renderToString } from '@exactjs/ssr';
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
		['datetime-local', '2026-01-02T03:04', Date.UTC(2026, 0, 2, 3, 4)],
		['time', '03:04', (3 * 60 + 4) * 60_000],
		['month', '2026-01', (2026 - 1970) * 12],
		['week', '2026-W01', Date.UTC(2025, 11, 29)],
		['text', '9', 9]
	] as const) {
		owner.state.type = type;
		flushSync();
		input.value = value;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(owner.state.value).toBe(expected);
		expect(input.value).toBe(value);
		expect(host.querySelector('input')).toBe(input);
	}
	owner.state.value = Date.UTC(2026, 0, 2);
	owner.state.type = 'date';
	flushSync();
	expect(input.value).toBe('2026-01-02');
	owner.state.type = 'text';
	flushSync();
	expect(input.value).toBe(String(Date.UTC(2026, 0, 2)));
	input.value = '';
	input.dispatchEvent(new Event('change', { bubbles: true }));
	flushSync();
	expect(owner.state.value).toBeNull();
	owner.state.type = 'date';
	flushSync();
	expect(input.value).toBe('');
	expect(reports).toEqual([]);
});

it.each(['bound', 'explicit'] as const)(
	'preserves %s numeric temporal values on initial rendering and hydration',
	async (mode) => {
		const controls = [
			['date', '2026-01-02', Date.UTC(2026, 0, 2)],
			['datetime-local', '2026-01-02T03:04', Date.UTC(2026, 0, 2, 3, 4)],
			['time', '03:04', (3 * 60 + 4) * 60_000],
			['month', '2026-01', (2026 - 1970) * 12],
			['week', '2026-W01', Date.UTC(2025, 11, 29)]
		] as const;
		const root = await createTestWorkspace('.exact-form-temporal-', process.cwd());
		const files = await writeTestFiles(root, {
			'form.tsx': `import {type Component} from '@exactjs/core';
export let owner:Component<{values:(number|null)[]}>;
export function Form(this:Component<{values:(number|null)[]}>){owner=this;this.state.values=${JSON.stringify(controls.map(([, , value]) => value))};
return()=> <section>${controls.map(([type], index) => `<input type="${type}" ${mode === 'bound' ? 'value:onChange' : 'value'}={this.state.values[${index}]}/>`).join('')}</section>;}`
		});
		const compiled = await compileFileArtifacts(files['form.tsx']!, {
			rootDir: root,
			outDir: root
		});
		const client = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
		const server = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
		for (const rendering of ['mount', 'hydrate']) {
			const host = document.createElement('div');
			const reports: unknown[] = [];
			onTestFinished(() => {
				unmount(host);
			});
			if (rendering === 'hydrate') {
				const result = await renderToHydratableString(receipt(server.Form as never, {}));
				host.innerHTML = result.html;
				// Verify server output before hydration can hide an incorrect initial projection.
				expect([...host.querySelectorAll('input')].map((input) => input.value)).toEqual(
					controls.map(([, value]) => value)
				);
				const originals = [...host.querySelectorAll('input')];
				hydrate(receipt(client.Form as never, {}), host, {
					resumptions: result.resumptions,
					onMismatch: 'throw',
					onErrorReport: (report) => reports.push(report)
				});
				expect([...host.querySelectorAll('input')]).toEqual(originals);
			} else {
				render(receipt(client.Form as never, {}), host, {
					onErrorReport: (report) => reports.push(report)
				});
			}
			const owner = client.owner as Component<{ values: (number | null)[] }>;
			const inputs = [...host.querySelectorAll('input')];
			expect(inputs.map((input) => input.value)).toEqual(controls.map(([, value]) => value));
			for (const [index, input] of inputs.entries()) {
				owner.state.values[index] = null;
				flushSync();
				expect(input.value).toBe('');
				if (mode === 'bound') {
					input.value = controls[index]![1];
					input.dispatchEvent(new Event('change', { bubbles: true }));
					flushSync();
					expect(owner.state.values[index]).toBe(controls[index]![2]);
					expect(input.value).toBe(controls[index]![1]);
				}
				owner.state.values[index] = controls[index]![2];
				flushSync();
				expect(input.value).toBe(controls[index]![1]);
			}
			expect([...host.querySelectorAll('input')]).toEqual(inputs);
			expect(reports).toEqual([]);
			unmount(host);
			expect(host.childNodes).toHaveLength(0);
		}
	}
);

it.each(['bound', 'explicit'] as const)(
	'preserves %s root calendar values without duplicating type-helper evaluations',
	async (mode) => {
		const root = await createTestWorkspace('.exact-form-temporal-root-', process.cwd());
		const files = await writeTestFiles(root, {
			'form.tsx': `import {type Component} from '@exactjs/core';
export const calls={count:0};
function inputType(type:string){calls.count++;return type;}
export let owner:Component<{value:number|null;type:string}>;
export function Form(this:Component<{value:number|null;type:string}>){owner=this;this.state.value=1767312000000;this.state.type='date';return()=> <input ${mode === 'bound' ? 'value:onChange' : 'value'}={this.state.value} type={inputType(this.state.type)}/>;}`
		});
		const compiled = await compileFileArtifacts(files['form.tsx']!, {
			rootDir: root,
			outDir: root
		});
		const client = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
		const server = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
		const result = await renderToHydratableString(receipt(server.Form as never, {}));
		expect((server.calls as { count: number }).count).toBe(1);
		const host = document.createElement('div');
		onTestFinished(() => {
			unmount(host);
		});
		host.innerHTML = result.html;
		const input = host.querySelector('input')!;
		expect(input.value).toBe('2026-01-02');
		const reports: unknown[] = [];
		hydrate(receipt(client.Form as never, {}), host, {
			resumptions: result.resumptions,
			onMismatch: 'throw',
			onErrorReport: (report) => reports.push(report)
		});
		expect(host.querySelector('input')).toBe(input);
		expect(input.value).toBe('2026-01-02');
		expect((client.calls as { count: number }).count).toBe(1);
		const owner = client.owner as Component<{ value: number | null; type: string }>;
		owner.state.value = Date.UTC(2026, 0, 3);
		flushSync();
		expect(input.value).toBe('2026-01-03');
		expect((client.calls as { count: number }).count).toBe(2);
		owner.state.type = 'text';
		flushSync();
		expect(input.value).toBe(String(Date.UTC(2026, 0, 3)));
		expect((client.calls as { count: number }).count).toBe(3);
		owner.state.type = 'date';
		flushSync();
		expect(input.value).toBe('2026-01-03');
		expect((client.calls as { count: number }).count).toBe(4);
		expect(reports).toEqual([]);
	}
);

it.each(['date', 'DATE'] as const)(
	'retains native Date aliases and HTML years with type %s',
	async (type) => {
		const root = await createTestWorkspace('.exact-native-date-surface-', process.cwd());
		const files = await writeTestFiles(root, {
			'form.tsx': `import {type Component} from '@exactjs/core';type Day=Date;export let owner:Component<{day:Day|null}>;
export function Form(this:Component<{day:Day|null}>){owner=this;this.state.day=null;return()=> <section><input type="${type}" value:onChange={this.state.day}/><input type="${type}" value={this.state.day??new Date('+010000-01-02T00:00:00.000Z')}/></section>;}`
		});
		const compiled = await compileFileArtifacts(files['form.tsx']!, {
			rootDir: root,
			outDir: root
		});
		const client = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
		const server = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
		for (const mode of ['mount', 'hydrate']) {
			const host = document.createElement('div');
			onTestFinished(() => {
				unmount(host);
			});
			const reports: unknown[] = [];
			if (mode === 'hydrate') {
				const result = await renderToHydratableString(receipt(server.Form as never, {}));
				host.innerHTML = result.html;
				expect([...host.querySelectorAll('input')].map((input) => input.value)).toEqual([
					'',
					'10000-01-02'
				]);
				const originals = [...host.querySelectorAll('input')];
				hydrate(receipt(client.Form as never, {}), host, {
					resumptions: result.resumptions,
					onMismatch: 'throw',
					onErrorReport: (report) => reports.push(report)
				});
				expect([...host.querySelectorAll('input')]).toEqual(originals);
			} else
				render(receipt(client.Form as never, {}), host, {
					onErrorReport: (report) => reports.push(report)
				});
			const owner = client.owner as Component<{ day: Date | null }>;
			const inputs = [...host.querySelectorAll('input')];
			expect(inputs.map((input) => input.value)).toEqual(['', '10000-01-02']);
			owner.state.day = null;
			flushSync();
			expect(inputs.map((input) => input.value)).toEqual(['', '10000-01-02']);
			for (const value of ['2026-01-03', '10000-01-02']) {
				inputs[0]!.value = value;
				inputs[0]!.dispatchEvent(new Event('change', { bubbles: true }));
				flushSync();
				expect((owner.state.day as Date | null)?.getTime()).toBe(inputs[0]!.valueAsDate?.getTime());
				expect(inputs.map((input) => input.value)).toEqual([value, value]);
			}
			expect(reports).toEqual([]);
			unmount(host);
			expect(host.childNodes).toHaveLength(0);
		}
	}
);

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

it('projects Date state in ordinary server markup but rejects it in hydration state', async () => {
	const root = await createTestWorkspace('.exact-date-transport-', process.cwd());
	const files = await writeTestFiles(root, {
		'form.tsx': `import {type Component} from '@exactjs/core';
export function Form(this:Component<{day:Date}>){this.state.day=new Date('2026-01-02T00:00:00.000Z');return()=> <input type="DATE" value:onChange={this.state.day}/>;}`
	});
	const compiled = await compileFileArtifacts(files['form.tsx']!, { rootDir: root, outDir: root });
	const server = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
	const html = await renderToString(receipt(server.Form as never, {}));
	expect(html.html).toContain('value="2026-01-02"');
	await expect(renderToHydratableString(receipt(server.Form as never, {}))).rejects.toThrow(
		'Hydration payload must be JSON-serializable'
	);
});

it('gives a native Date input receipt to an unchanged helper in a blocking task', async () => {
	const root = await createTestWorkspace('.exact-date-helper-receipt-', process.cwd());
	const files = await writeTestFiles(root, {
		'form.tsx': `import {TaskContext,type Component} from '@exactjs/core';
function read(day:Date){return day.getTime();}
export function Form(this:Component<{day:Date|null;values:number[];result:number}>){this.state.day=null;this.state.values=[];this.state.result=0;
function run(task:TaskContext=TaskContext.client().blocking()){this.state.values.push(0);this.state.result=read(this.state.day!);}
return()=> <section><input type="date" value:onChange={this.state.day}/><button onClick={()=>run()}>Read</button><output>{this.state.result}</output></section>;}`
	});
	const compiled = await compileFileArtifacts(files['form.tsx']!, { rootDir: root, outDir: root });
	const client = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
	const host = document.createElement('div');
	onTestFinished(() => {
		unmount(host);
	});
	const reports: unknown[] = [];
	render(receipt(client.Form as never, {}), host, {
		onErrorReport: (report) => reports.push(report)
	});
	const input = host.querySelector('input')!;
	input.value = '2026-01-02';
	input.dispatchEvent(new Event('change', { bubbles: true }));
	flushSync();
	host.querySelector('button')!.click();
	await expect
		.poll(() => host.querySelector('output')?.textContent)
		.toBe(String(Date.UTC(2026, 0, 2)));
	expect(reports).toEqual([]);
});

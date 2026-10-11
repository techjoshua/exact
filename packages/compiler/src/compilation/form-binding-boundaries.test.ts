/** @vitest-environment jsdom */
import { expect, it, onTestFinished } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it('preserves typed form conversion and DOM identity on mount and hydration', async () => {
	const root = await createTestWorkspace('.exact-form-boundaries-', process.cwd());
	const entry = path.join(root, 'form.tsx');
	await writeFile(
		entry,
		`import {type Component} from '@exactjs/core';
type State={count:number|null;enabled:boolean;choice:string;tags:string[];day:Date|null;open:boolean};
export let owner:Component<State>;
export function Form(this:Component<State>){owner=this;this.state.count=2;this.state.enabled=true;this.state.choice='a';this.state.tags=['a'];this.state.day=null;this.state.open=false;
return()=> <section><input type="number" value:onInput={this.state.count}/><input type="checkbox" checked:onChange={this.state.enabled}/><input type="radio" value="b" checked:onChange={this.state.choice}/><select multiple value:onChange={this.state.tags}><option value="a">A</option><option value="b">B</option></select><input type="date" value:onChange={this.state.day}/><details open:onToggle={this.state.open}>Details</details></section>;}`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	for (const mode of ['mount', 'hydrate'] as const) {
		const host = document.createElement('div');
		onTestFinished(() => {
			unmount(host);
		});
		const reports: unknown[] = [];
		if (mode === 'hydrate') {
			const output = await renderToHydratableString(receipt(server.Form as never, {}));
			host.innerHTML = output.html;
			const original = host.querySelector('input');
			hydrate(receipt(client.Form as never, {}), host, {
				...composeExactComponentContracts([client.Form as AnyComponentFunction], 'client'),
				resumptions: output.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r.error)
			});
			expect(host.querySelector('input')).toBe(original);
		} else
			render(receipt(client.Form as never, {}), host, {
				onErrorReport: (r) => reports.push(r.error)
			});
		const state = (
			client.owner as {
				state: {
					count: number | null;
					enabled: boolean;
					choice: string;
					tags: string[];
					day: Date | null;
					open: boolean;
				};
			}
		).state;
		const number = host.querySelector<HTMLInputElement>('[type=number]')!;
		expect(number.value).toBe('2');
		number.value = '7';
		number.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		expect(state.count).toBe(7);
		number.value = '';
		number.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		expect(state.count).toBeNull();
		const check = host.querySelector<HTMLInputElement>('[type=checkbox]')!;
		check.checked = false;
		check.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(state.enabled).toBe(false);
		const radio = host.querySelector<HTMLInputElement>('[type=radio]')!;
		radio.checked = true;
		radio.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(state.choice).toBe('b');
		radio.checked = false;
		radio.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(state.choice).toBe('b');
		const select = host.querySelector('select')!;
		select.options[0]!.selected = false;
		select.options[1]!.selected = true;
		select.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect([...state.tags]).toEqual(['b']);
		const date = host.querySelector<HTMLInputElement>('[type=date]')!;
		date.value = '2026-01-02';
		date.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(state.day?.toISOString()).toBe('2026-01-02T00:00:00.000Z');
		date.value = '';
		date.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(state.day).toBeNull();
		const details = host.querySelector('details')!;
		details.open = true;
		details.dispatchEvent(new Event('toggle'));
		flushSync();
		expect(state.open).toBe(true);
		details.open = false;
		details.dispatchEvent(new Event('toggle'));
		flushSync();
		expect(state.open).toBe(false);
		expect(host.querySelector('[type=number]')).toBe(number);
		expect(reports).toEqual([]);
		unmount(host);
		expect(host.childNodes).toHaveLength(0);
	}
});

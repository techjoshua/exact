/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction, Component, RefKey } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '../../../hydrate/src/index.js';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
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
		const root = await createTestWorkspace('.exact-property-semantics-', process.cwd());
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
			const owner = client.owner as Component<{ count: number }>;
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

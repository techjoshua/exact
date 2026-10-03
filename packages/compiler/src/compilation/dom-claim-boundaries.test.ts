/** @vitest-environment jsdom */
import { expect, it, onTestFinished } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import type { AnyComponentFunction } from '@exactjs/core';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';

const button =
	'<button data-counter="" onClick={()=>this.state.count++}>{this.state.count}</button>';
const surround = (content: string, depth: number) =>
	'<section>'.repeat(depth) + content + '</section>'.repeat(depth);
const siblings = (width: number) =>
	'<i>static</i>'.repeat(width) + button + '<i>static</i>'.repeat(width);
const cases = [
	{ name: 'seven ancestors', content: surround(button, 7) },
	{ name: 'eight ancestors', content: surround(button, 8) },
	{ name: '63 siblings on either side', content: siblings(63) },
	{ name: '64 siblings on either side', content: siblings(64) },
	{
		name: 'variable ranges on either side',
		content: `{this.state.visible ? <i data-left="">left</i> : null}${button}{this.state.visible ? <i data-right="">right</i> : null}`
	},
	{
		name: 'deep SVG to HTML transition',
		content:
			'<svg><g><g><g><g><g><foreignObject>' +
			surround(button, 2) +
			'</foreignObject></g></g></g></g></g></svg>'
	}
];

it.each(cases)(
	'retains identity and updates across DOM claim fallback: $name',
	async ({ content }) => {
		const root = await createTestWorkspace('.exact-claim-boundaries-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		await writeFile(
			entry,
			`import {type Component} from '@exactjs/core';
export let owner:Component<{count:number;visible:boolean}>;
export function Page(this:Component<{count:number;visible:boolean}>){owner=this;this.state.count=0;this.state.visible=true;return()=> <article>${content}</article>;}`
		);
		const [artifact] = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		for (const mode of ['mount', 'hydrate'] as const) {
			const container = document.createElement('div');
			onTestFinished(() => {
				unmount(container);
			});
			const reports: unknown[] = [];
			let original: Element | null = null;
			if (mode === 'hydrate') {
				const output = await renderToHydratableString(receipt(server.Page as never, {}));
				container.innerHTML = output.html;
				original = container.querySelector('[data-counter]');
				hydrate(receipt(client.Page as never, {}), container, {
					...composeExactComponentContracts([client.Page as AnyComponentFunction], 'client'),
					resumptions: output.resumptions,
					onMismatch: 'throw',
					onErrorReport: (r) => reports.push(r.error)
				});
			} else
				render(receipt(client.Page as never, {}), container, {
					onErrorReport: (r) => reports.push(r.error)
				});
			const counter = container.querySelector<HTMLButtonElement>('[data-counter]')!;
			expect(counter).not.toBeNull();
			if (original) expect(counter).toBe(original);
			expect(counter.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
			counter.click();
			flushSync();
			expect(counter.textContent).toBe('1');
			const owner = client.owner as { state: { count: number; visible: boolean } };
			owner.state.visible = false;
			flushSync();
			expect(container.querySelector('[data-counter]')).toBe(counter);
			expect(container.querySelector('[data-left]')).toBeNull();
			owner.state.visible = true;
			flushSync();
			counter.click();
			flushSync();
			expect(counter.textContent).toBe('2');
			expect(container.querySelector('[data-counter]')).toBe(counter);
			expect(reports).toEqual([]);
			unmount(container);
			expect(container.childNodes).toHaveLength(0);
		}
	}
);

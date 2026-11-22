/** @vitest-environment jsdom */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { unmount } from '@exactjs/dom';
import { createExactClient, hydrate, readExactHydrationConfig } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';

const fixture = `import type {Component} from '@exactjs/core';
export let reached = 0, dormant = 0, deferred = 0;
export let receivers: number[] = [];
export function Child(this: Component<{}>, props:{item:{value:number; other?:number}}) {
 const cell = this.reactive(() => props.item.value);
 return () => <output>{cell.get()}</output>;
}
export function Deferred(props:{item:{value:number}}) {
 return () => <button onClick={() => void props.item.value}>read</button>;
}
export function Page(this: Component<{n:number}>) {
 this.state.n = 2;
 return () => <main>
  <button onClick={() => this.state.n++}>update</button>
  <Child item={{base:this.state.n,get value(){reached++;receivers.push(this.base);return this.base+document.title.length}} as {base:number;value:number}}/>
  <Child item={{value:7,get other(){dormant++;return document.title.length}}}/>
  <Deferred item={{get value(){deferred++;return document.title.length}}}/>
 </main>;
}
export function Passive() {
 return () => <main>
  <Child item={{get value(){reached++;return document.title.length}}}/>
  <Child item={{value:7,get other(){dormant++;return document.title.length}}}/>
 </main>;
}`;

for (const [serverComponents, passive] of [
	[false, false],
	[true, false],
	[true, true]
] as const) {
	it(`constructs reached getter inputs in the owning client render (serverComponents=${serverComponents}, passive=${passive})`, async () => {
		const root = await createCompilerTestWorkspace('.exact-member-input-', process.cwd());
		const input = path.join(root, 'page.tsx');
		const outDir = path.join(root, 'generated');
		await writeFile(input, fixture);
		const artifacts = await compileProjectArtifacts([input], {
			rootDir: root,
			outDir,
			serverComponents
		});
		const [artifact] = artifacts;
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const host = document.createElement('div');
		const errors: unknown[] = [];
		const options = {
			onMismatch: 'throw' as const,
			onErrorReport: (report: { error: unknown }) => errors.push(report.error)
		};
		document.title = 'exact';
		let dispose: (() => void) | undefined;
		try {
			const component = passive ? 'Passive' : 'Page';
			const output = await renderToHydratableString(
				receipt(server[component] as AnyComponentFunction, {})
			);
			expect([server.reached, server.dormant, server.deferred]).toEqual([0, 0, 0]);
			host.innerHTML = output.htmlWithHydration;
			const plain = host.querySelector('output');
			expect(plain?.textContent).toBe('7');
			expect(host.querySelectorAll('output')).toHaveLength(1);

			if (serverComponents) {
				const name = host
					.querySelector('[data-exact-client-name]')!
					.getAttribute('data-exact-client-name')!;
				const view = createExactClient(host, {
					...readExactHydrationConfig(host),
					...options,
					islands: { [name]: client[name] as AnyComponentFunction }
				});
				dispose = () => view.dispose();
				await view.whenSettled();
			} else {
				const page = client.Page as AnyComponentFunction;
				hydrate(receipt(page, {}), host, {
					...composeExactComponentContracts([page], 'client'),
					...options,
					resumptions: output.resumptions
				});
			}

			expect(Array.from(host.querySelectorAll('output'), (node) => node.textContent)).toEqual([
				passive ? '5' : '7',
				'7'
			]);
			expect(host.querySelectorAll('output')[1]).toBe(plain);
			if (passive) {
				expect([client.reached, client.dormant, client.deferred, errors]).toEqual([1, 0, 0, []]);
				return;
			}
			expect([client.reached, client.dormant, client.deferred, client.receivers]).toEqual([
				1,
				0,
				0,
				[2]
			]);
			host.querySelector('button')!.click();
			flushSync();
			expect(Array.from(host.querySelectorAll('output'), (node) => node.textContent)).toEqual([
				'8',
				'7'
			]);
			expect([client.reached, client.dormant, client.deferred, client.receivers]).toEqual([
				2,
				0,
				0,
				[2, 3]
			]);
			host.querySelectorAll('button')[1]!.click();
			flushSync();
			expect(client.deferred).toBe(1);
			expect(errors).toEqual([]);
		} finally {
			dispose?.();
			unmount(host);
		}
	});
}

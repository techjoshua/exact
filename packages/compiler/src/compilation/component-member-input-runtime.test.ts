/** @vitest-environment jsdom */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
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

const reachedInput = `{base:this.state.n,get value(){reached++;receivers.push(this);return this.base+document.title.length}} as {base:number;value:number}`;
const reachedAttributes = {
	before: `label="inert" item={${reachedInput}}`,
	after: `item={${reachedInput}} label={"inert"}`,
	siblingSpread: `item={${reachedInput}} {...{label:"inert"}}`,
	spread: `{...{item:${reachedInput}}}`,
	spreadLast: `item={{value:0}} {...({item:${reachedInput}} as {item?:{value:number}})}`,
	spreadFirst: `{...{item:${reachedInput}}} {...{label:"inert"}}`,
	sole: `item={${reachedInput}}`
};

const fixture = (
	attributes: keyof typeof reachedAttributes
) => `import type {Component} from '@exactjs/core';
export let reached = 0, dormant = 0, deferred = 0;
export let receivers: {base:number;value:number}[] = [];
export function Child(this: Component<{}>, props:{item:{value:number; other?:number}; label?:string}) {
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
  <Child ${reachedAttributes[attributes]}/>
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

for (const [serverComponents, passive, packageType, attributes] of [
	[false, false, 'application', 'before'],
	[true, false, 'application', 'before'],
	[false, false, 'library', 'after'],
	[true, false, 'library', 'siblingSpread'],
	[false, false, 'application', 'spread'],
	[true, false, 'application', 'spreadLast'],
	[false, false, 'library', 'spreadFirst'],
	[true, false, 'library', 'spread'],
	[true, true, 'application', 'sole']
] as const) {
	it(`constructs reached getter inputs in the owning client render (serverComponents=${serverComponents}, ${packageType}, ${attributes})`, async () => {
		const root = await createCompilerTestWorkspace('.exact-member-input-', process.cwd());
		const input = path.join(root, 'page.tsx');
		const outDir = path.join(root, 'generated');
		await writeFile(input, fixture(attributes));
		const artifacts = await compileProjectArtifacts([input], {
			rootDir: root,
			outDir,
			packageType,
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
			vi.stubGlobal('document', undefined);
			const output = await renderToHydratableString(
				receipt(server[component] as AnyComponentFunction, {})
			).finally(() => vi.unstubAllGlobals());
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
			const receivers = client.receivers as { base: number; value: number }[];
			expect([client.reached, client.dormant, client.deferred]).toEqual([1, 0, 0]);
			expect(receivers.map((receiver) => receiver.base)).toEqual([2]);
			expect(Object.getOwnPropertyDescriptor(receivers[0]!, 'value')?.get).toBeTypeOf('function');
			const reached = host.querySelector('output');
			for (const n of [3, 4]) {
				host.querySelector('button')!.click();
				flushSync();
				expect(reached?.textContent).toBe(String(n + 5));
				expect(plain?.textContent).toBe('7');
				expect([client.reached, client.dormant, client.deferred]).toEqual([n - 1, 0, 0]);
				const nextReceiver = receivers[n - 2]!;
				expect(nextReceiver.base).toBe(n);
				expect(Object.is(nextReceiver, receivers[n - 3])).toBe(false);
				expect(Object.getOwnPropertyDescriptor(nextReceiver, 'value')?.get).toBeTypeOf('function');
			}
			expect(receivers.map((receiver) => receiver.base)).toEqual([2, 3, 4]);
			host.querySelectorAll('button')[1]!.click();
			flushSync();
			expect(client.deferred).toBe(1);
			expect(host.querySelector('output')).toBe(reached);
			expect(host.querySelectorAll('output')[1]).toBe(plain);
			expect(errors).toEqual([]);
		} finally {
			dispose?.();
			unmount(host);
		}
	});
}

it('keeps outer spread getters in SSR when a later input replaces their value', async () => {
	const root = await createCompilerTestWorkspace('.exact-member-input-', process.cwd());
	const input = path.join(root, 'page.tsx');
	await writeFile(
		input,
		`import type {Component} from '@exactjs/core';
export const calls: string[] = [];
function Child(this: Component<{}>, props:{item:{value:number}}) {
 const cell = this.reactive(() => props.item.value);
 return () => <output>{cell.get()}</output>;
}
export function Page(props:{inputs:{item:{value:number}}}) {
 return () => <main>
  <Child {...{get item(){calls.push('outer');return {get value(){calls.push('overwritten');return document.title.length}}}}} {...{item:{value:3}}}/>
  <Child {...props.inputs} item={{value:4}}/>
 </main>;
}`
	);
	const [artifact] = await compileProjectArtifacts([input], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const calls = server.calls as string[];
	const inputs = {
		get item() {
			calls.push('unknown');
			return {
				get value() {
					throw new Error('read overwritten item');
				}
			};
		}
	};
	vi.stubGlobal('document', undefined);
	const output = await renderToHydratableString(
		receipt(server.Page as AnyComponentFunction, { inputs })
	).finally(() => vi.unstubAllGlobals());
	const host = document.createElement('div');
	host.innerHTML = output.htmlWithHydration;
	expect(Array.from(host.querySelectorAll('output'), (node) => node.textContent)).toEqual([
		'3',
		'4'
	]);
	expect(calls).toEqual(['outer', 'unknown']);
});

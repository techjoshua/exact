/** @vitest-environment jsdom */
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import {
	composeExactComponentContracts,
	exactComponentIdentity
} from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '../../../hydrate/src/index.js';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';

import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(['default declaration', 'default alias', 'renamed barrel', 'star barrel'])(
	'preserves component identity through %s and dependency replacement',
	async (shape) => {
		const root = await createTestWorkspace('.exact-export-semantics-', process.cwd());
		const imports = shape.startsWith('default')
			? "import Selected from './child.js';"
			: shape === 'renamed barrel'
				? "import {Selected} from './barrel.js';"
				: "import {Child as Selected} from './barrel.js';";
		const files = await writeTestFiles(root, {
			'child.tsx': '',
			'barrel.ts':
				shape === 'renamed barrel'
					? "export {Child as Selected} from './child.js';"
					: "export * from './child.js';",
			'page.tsx': `import {type Component} from '@exactjs/core';${imports}export {Selected};export let owner:Component<{label:string}>;
export function Page(this:Component<{label:string}>){owner=this;this.state.label='first';return()=> <main><Selected label={this.state.label}/></main>;}`
		});
		let previousID: string | undefined;
		for (const version of ['old', 'new']) {
			const source = `import {type Component} from '@exactjs/core';${shape === 'default declaration' ? 'export default' : 'export'} function Child(this:Component<{count:number}>,props:{label:string}){this.state.count=0;return()=> <button onClick={()=>this.state.count++}>{props.label}:${version}:{this.state.count}</button>;} ${shape === 'default alias' ? 'const Alias=Child;export default Alias;' : ''}`;
			await writeTestFiles(root, { 'child.tsx': source });
			const require = createRequire(path.resolve('framework-adapters/vite-plugin/package.json'));
			const previousEncoder = globalThis.TextEncoder;
			const previousArray = globalThis.Uint8Array;
			onTestFinished(() => {
				globalThis.TextEncoder = previousEncoder;
				globalThis.Uint8Array = previousArray;
			});
			globalThis.TextEncoder = NodeTextEncoder;
			globalThis.Uint8Array = new NodeTextEncoder().encode('').constructor as Uint8ArrayConstructor;
			const { exact } = await import('../../../../framework-adapters/vite-plugin/src/index.js');
			const { build } = await import(pathToFileURL(require.resolve('vite')).href);
			const modules: Record<string, Record<string, unknown>> = {};
			for (const target of ['client', 'server'] as const) {
				const outDir = path.join(root, `generated-${target}`);
				await build({
					root,
					configFile: false,
					logLevel: 'silent',
					plugins: [
						exact({
							applicationRoot: root,
							target,
							serverComponents: false,
							reactCompatibility: false
						})
					],
					build: {
						outDir,
						ssr: target === 'server' ? files['page.tsx'] : false,
						minify: false,
						lib: { entry: files['page.tsx'], formats: ['es'], fileName: 'entry' },
						rollupOptions: {
							external: (id: string) => id.startsWith('@exactjs/'),
							output: { entryFileNames: 'entry.js' }
						}
					}
				});
				modules[target] = await importArtifact(
					path.join(outDir, 'entry.js'),
					path.join(root, `${target}-${version}.mjs`)
				);
			}
			globalThis.TextEncoder = previousEncoder;
			globalThis.Uint8Array = previousArray;
			const client = modules.client!;
			const server = modules.server!;
			const identity = exactComponentIdentity(client.Selected as AnyComponentFunction);
			expect(identity).toBe(exactComponentIdentity(server.Selected as AnyComponentFunction));
			expect(identity).toBeTruthy();
			if (previousID) expect(identity).toBe(previousID);
			previousID = identity;
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
						...composeExactComponentContracts(
							[client.Page, client.Selected] as AnyComponentFunction[],
							'client'
						),
						resumptions: output.resumptions,
						onMismatch: 'throw',
						onErrorReport: (r) => reports.push(r.error)
					});
				} else
					render(receipt(client.Page as never, {}), host, {
						onErrorReport: (r) => reports.push(r.error)
					});
				const button = host.querySelector('button')!;
				if (original) expect(button).toBe(original);
				expect(button.textContent).toBe(`first:${version}:0`);
				button.click();
				flushSync();
				expect(button.textContent).toBe(`first:${version}:1`);
				(client.owner as { state: { label: string } }).state.label = 'second';
				flushSync();
				expect(button.textContent).toBe(`second:${version}:1`);
				button.click();
				flushSync();
				expect(button.textContent).toBe(`second:${version}:2`);
				expect(host.querySelector('button')).toBe(button);
				expect(reports).toEqual([]);
				unmount(host);
				expect(host.childNodes).toHaveLength(0);
			}
		}
	}
);

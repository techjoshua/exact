/** @vitest-environment jsdom */
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import { renderToString } from '@exactjs/ssr';
import { render, dispose } from '@exactjs/dom';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import type { createPendingReactiveTransaction } from '@exactjs/reactive/framework/transactions';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { importArtifact } from '../test-support/import-artifact.js';

for (const form of ['method', 'getter', 'parameter'] as const)
	for (const target of ['client', 'server'] as const)
		it(`renders ${form} JSX through original and pending class helpers (${target})`, async () => {
			const directory = path.resolve('.tmp/task-helper-jsx', form, target);
			await mkdir(directory, { recursive: true });
			const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
			onTestFinished(() => compiler.dispose());
			const body =
				form === 'getter'
					? 'get view(){return <><span>{this.#count}</span></>;}'
					: form === 'parameter'
						? 'render(view=<span>{this.#count}</span>){return view;}'
						: 'render(){return <><span>{this.#count}</span></>;}';
			const result = compiler.request({
				kind: 'compile',
				target,
				root: process.cwd(),
				id: path.join(directory, 'helper.tsx'),
				source: `import type {RenderResult} from "@exactjs/core"; export class Counter {#count=9;get count(){return this.#count;}increment(){this.#count++;}${body}} export function Probe(props: {view: RenderResult}) {return () => <>{props.view}</>;}`,
				diagnostics: 'semantic'
			});
			expect(result.error).toBeUndefined();
			expect(result.diagnostics).toEqual([]);
			const filename = path.join(directory, 'helper.ts');
			await writeFile(filename, result.code!);
			const module = await importArtifact(filename, path.join(directory, 'helper.mjs'));
			type View = Parameters<typeof renderToString>[0];
			const Counter = module.Counter as new () => { count: number; render(): View; view: View };
			const counter = new Counter();
			// Generated artifacts use the installed provider graph. Select its public framework entry
			// so registry ownership matches, rather than mixing it with Vitest's source aliases.
			const provider = path.join(directory, 'provider.ts');
			await writeFile(
				provider,
				"export { createPendingReactiveTransaction } from '@exactjs/reactive/framework/transactions';"
			);
			const runtime = (await importArtifact(provider, path.join(directory, 'provider.mjs'))) as {
				createPendingReactiveTransaction: typeof createPendingReactiveTransaction;
			};
			const text = async (view: View) => {
				const host = document.createElement('div');
				try {
					if (target === 'server')
						host.innerHTML = (await renderToString(view, { markers: false })).html;
					else
						render(
							createCompiledComponentReceipt(module.Probe as AnyComponentFunction, { view }),
							host
						);
					expect(host.querySelectorAll('span')).toHaveLength(1);
					return host.textContent;
				} finally {
					dispose(host, true);
				}
			};
			const ordinary = () => (form === 'getter' ? counter.view : counter.render());
			expect(await text(ordinary())).toBe('9');
			for (const settle of ['discard', 'commit'] as const) {
				const root = { counter };
				const pending = runtime.createPendingReactiveTransaction(root);
				pending.read(root, 'counter');
				pending.helperMember(counter, 'increment')();
				const view =
					form === 'getter'
						? pending.read(counter, 'view')
						: pending.helperMember(counter, 'render')();
				expect(await text(view as View)).toBe('10');
				expect(counter.count).toBe(9);
				pending[settle]();
				expect(counter.count).toBe(settle === 'commit' ? 10 : 9);
				expect(await text(ordinary())).toBe(settle === 'commit' ? '10' : '9');
			}
		});

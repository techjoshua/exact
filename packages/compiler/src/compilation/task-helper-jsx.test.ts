/** @vitest-environment jsdom */
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import { renderToString } from '@exactjs/ssr';
import { render, dispose } from '@exactjs/dom';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { importArtifact } from '../test-support/import-artifact.js';

for (const form of ['method', 'getter', 'parameter'] as const)
	for (const target of ['client', 'server'] as const)
		it(`renders ${form} JSX through ordinary component-support helpers (${target})`, async () => {
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
			const Counter = module.Counter as new () => {
				count: number;
				increment(): void;
				render(): View;
				view: View;
			};
			const counter = new Counter();
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
			counter.increment();
			expect(await text(ordinary())).toBe('10');
		});

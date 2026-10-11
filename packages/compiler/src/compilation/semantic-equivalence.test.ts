/** @vitest-environment jsdom */
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { render, dispose } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

const forms = {
	direct: 'const value = this.state.values[0] ?? this.state.fallback;',
	literal: "const value = this.state.values['0'] ?? this.state.fallback;",
	computed: 'const key = 0; const value = this.state.values[key] ?? this.state.fallback;',
	helper: 'const value = select(this.state.values, this.state.fallback);',
	destructured: 'const [value = this.state.fallback] = this.state.values;',
	'short-circuit':
		'const value = this.state.values.length ? this.state.values[0] : this.state.fallback;'
} as const;
const writes = {
	direct: { code: 'this.state.values = record.items;', trace: 'get' },
	'object-assignment': {
		code: "({[(() => {log.push('key');return 'items' as const;})()]: this.state.values} = record);",
		trace: 'key,get'
	},
	'array-assignment': {
		code: "function* items(){try{log.push('next');yield next;}finally{log.push('close');}} [this.state.values] = items();",
		trace: 'next,close'
	}
} as const;

// The reference observes ordinary JS values, independently of compiler analysis or emitted code.
// Every source form gets identical commands, including empty and zero values and a second update.
for (const [form, declaration] of Object.entries(forms)) {
	for (const [write, assignment] of Object.entries(writes)) {
		it(`preserves ${form}/${write} evaluation and updates`, async () => {
			await mkdir(path.resolve('.tmp'), { recursive: true });
			const root = await createTestWorkspace('semantic-equivalence-', path.resolve('.tmp'));
			const source = `import type {Component} from '@exactjs/core';
function select(values:number[], fallback:number) {return values[0] ?? fallback;}
export function Probe(this:Component<{values:number[];fallback:number;step:number;trace:string}>) {
 this.state.values=[]; this.state.fallback=9; this.state.step=0; this.state.trace='';
 ${declaration}
 return ()=> <section><output>{value}</output><span data-trace>{this.state.trace}</span><button onClick={()=>{
  this.state.step++;
  const next = this.state.step % 3 === 1 ? [0,2] : this.state.step % 3 === 2 ? [5,6] : [];
  const log:string[]=[]; const record={get items(){log.push('get');return next;}};
  ${assignment.code}
  this.state.trace=log.join(',');
  this.state.fallback += 1;
 }}>Next</button></section>;
}`;
			const file = path.join(root, 'probe.tsx');
			await writeFile(file, source);
			const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
			onTestFinished(() => compiler.dispose());
			const valid = compiler.request({
				kind: 'check',
				id: file,
				source,
				root,
				diagnostics: 'semantic'
			});
			expect(valid.error).toBeUndefined();
			expect(valid.diagnostics).toEqual([]);
			for (const target of ['client', 'server'] as const) {
				const compiled = compiler.request({
					kind: 'compile',
					id: file,
					source,
					root,
					target,
					diagnostics: 'semantic'
				});
				expect(compiled.error, target).toBeUndefined();
				expect(compiled.diagnostics, target).toEqual([]);
				expect(
					compiled.analysis.components.find((component) => component.name === 'Probe')?.placement,
					target
				).toBe('isomorphic');
			}
			const invalid = compiler.request({
				kind: 'check',
				id: file,
				// Every transformed assignment must preserve its authored destination constraint.
				source: source.replace(
					'const next = this.state.step % 3 === 1 ? [0,2] : this.state.step % 3 === 2 ? [5,6] : [];',
					"const next = ['bad'];"
				),
				root,
				diagnostics: 'semantic'
			});
			expect(invalid.error).toBeUndefined();
			expect(
				invalid.diagnostics.map((diagnostic) => ({
					code: diagnostic.code,
					message: diagnostic.message
				}))
			).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TS2322' })]));
			const [artifact] = await compileProjectArtifacts([file], {
				rootDir: root,
				outDir: path.join(root, 'generated')
			});
			expect(artifact).toBeDefined();
			const clientModule = await importArtifact(
				artifact!.clientFile,
				path.join(root, 'client.mjs')
			);
			const serverModule = await importArtifact(
				artifact!.serverFile,
				path.join(root, 'server.mjs')
			);
			const Client = clientModule.Probe as AnyComponentFunction;
			const Server = serverModule.Probe as AnyComponentFunction;
			for (const mode of ['mount', 'hydrate'] as const) {
				const reports: unknown[] = [];
				const diagnostics: unknown[] = [];
				const errorOptions = { onErrorReport: (report: unknown) => reports.push(report) };
				const host = document.createElement('div');
				document.body.append(host);
				onTestFinished(() => {
					dispose(host, true);
					host.remove();
				});
				if (mode === 'hydrate') {
					const output = await renderToHydratableString(createCompiledComponentReceipt(Server, {}));
					host.innerHTML = output.html;
					const adopted = host.querySelector('output');
					const client = hydrate(createCompiledComponentReceipt(Client, {}), host, {
						...composeExactComponentContracts([Client], 'client'),
						...errorOptions,
						onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
						resumptions: output.resumptions,
						onMismatch: 'throw'
					});
					onTestFinished(() => client.dispose());
					expect(host.querySelector('output'), mode).toBe(adopted);
				} else render(createCompiledComponentReceipt(Client, {}), host, errorOptions);
				const output = host.querySelector('output')!;
				const button = host.querySelector('button')!;
				expect(output.textContent, mode).toBe('9');
				const reference = { values: [] as number[], fallback: 9 };
				for (let step = 1; step <= (process.env.EXACT_EXTENDED_TESTING === '1' ? 30 : 6); step++) {
					reference.values = step % 3 === 1 ? [0, 2] : step % 3 === 2 ? [5, 6] : [];
					reference.fallback++;
					button.click();
					flushSync();
					expect(output.textContent, `${mode}, step ${step}, source:\n${source}`).toBe(
						String(reference.values.length ? reference.values[0] : reference.fallback)
					);
					expect(host.querySelector('[data-trace]')?.textContent).toBe(assignment.trace);
					expect(host.querySelector('output')).toBe(output);
				}
				dispose(host, true);
				button.click();
				flushSync();
				expect(host.childNodes).toHaveLength(0);
				expect(reports).toEqual([]);
				expect(diagnostics).toEqual([]);
			}
		}, 30_000);
	}
}

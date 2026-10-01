import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import type { createPendingReactiveTransaction } from '@exactjs/reactive/framework/transactions';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { importArtifact } from '../test-support/import-artifact.js';

for (const operator of ['-', '+', '~', '!'] as const)
	for (const member of ['super.value', 'this.#count'] as const)
		for (const target of ['client', 'server'] as const)
			it(`retains ${operator}${member} as a read in a pending class helper (${target})`, async () => {
				const directory = path.resolve(
					'.tmp/task-helper-unary',
					String(operator.charCodeAt(0)),
					member === 'super.value' ? 'super' : 'private',
					target
				);
				await mkdir(directory, { recursive: true });
				onTestFinished(() => rm(directory, { recursive: true, force: true }));
				const compiler = new NativeCompilerProcess({
					executable: resolveNativeCompilerExecutable()
				});
				onTestFinished(() => compiler.dispose());
				const result = compiler.request({
					kind: 'compile',
					target,
					root: process.cwd(),
					id: path.join(directory, 'helper.ts'),
					diagnostics: 'semantic',
					source: `
export class Base {get value(){return 9;}set value(value:number){throw new Error("read invoked setter");}}
export class Counter extends Base {#count=9;get count(){return this.#count;}read(){return ${operator}${member};}increment(){return this.#count++;}}
`
				});
				expect(result.error).toBeUndefined();
				expect(result.diagnostics).toEqual([]);
				const file = path.join(directory, 'helper.ts');
				await writeFile(file, result.code!);
				const module = await importArtifact(file, path.join(directory, 'helper.mjs'));
				const provider = path.join(directory, 'provider.ts');
				await writeFile(
					provider,
					"export {createPendingReactiveTransaction} from '@exactjs/reactive/framework/transactions';"
				);
				const runtime = (await importArtifact(provider, path.join(directory, 'provider.mjs'))) as {
					createPendingReactiveTransaction: typeof createPendingReactiveTransaction;
				};
				const Counter = module.Counter as new () => { count: number; read(): number | boolean };
				const counter = new Counter();
				const expected =
					operator === '-' ? -9 : operator === '+' ? 9 : operator === '~' ? -10 : false;
				expect(counter.read()).toBe(expected);
				const root = { counter };
				const staged: Array<() => void> = [];
				const pending = runtime.createPendingReactiveTransaction(root, {
					stage: (mutation) => staged.push(mutation)
				});
				pending.read(root, 'counter');
				const selected = staged.length;
				// Reading a field must neither invoke a setter nor acquire mutation publication work.
				expect(pending.helperMember(counter, 'read')()).toBe(expected);
				expect(staged).toHaveLength(selected);
				pending.discard();
				for (const settlement of ['discard', 'commit'] as const) {
					const next = runtime.createPendingReactiveTransaction(root);
					next.read(root, 'counter');
					expect(next.helperMember(counter, 'increment')()).toBe(9);
					expect(next.read(counter, 'count')).toBe(10);
					expect(counter.count).toBe(9);
					next[settlement]();
					expect(counter.count).toBe(settlement === 'commit' ? 10 : 9);
				}
			});

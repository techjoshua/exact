import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

for (const target of ['client', 'server'] as const) {
	it(`preserves ordinary helpers and classes without alternate implementations (${target})`, () => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const result = compiler.request({
			kind: 'compile',
			target,
			root: process.cwd(),
			id: path.resolve('.tmp/ordinary-helper-boundary.ts'),
			source:
				'export class Counter { #step=2; work(state:{count:number}) { state.count+=this.#step;return state.count; } } export const work=(state:{count:number})=>new Counter().work(state);'
		});
		expect(result.error).toBeUndefined();
		expect(result.diagnostics).toEqual([]);
		expect(result.code).toContain('#step');
		expect(result.code).not.toContain('registerTaskHelper');
		expect(result.code).not.toContain('__exactHelper');
		expect(result.code).not.toContain('@exactjs/core/runtime/task-helpers');
	});

	it(`gives original and project helpers the same pending input contract (${target})`, async () => {
		const { compiled, authored, runtime } = await privateHelperArtifact(
			'export class Counter { #step=2; work(state:{count:number}) { state.count+=this.#step;return state.count; } } export function work(state:{count:number}) { return new Counter().work(state); }',
			target
		);
		for (const module of [authored, compiled]) {
			const root = runtime.reactive({ count: 0 });
			for (const settlement of ['discard', 'commit'] as const) {
				const pending = runtime.createPendingReactiveTransaction(root);
				expect(pending.helper(module.work)(root)).toBe(2);
				expect(root.count).toBe(0);
				pending[settlement]();
				expect(root.count).toBe(settlement === 'commit' ? 2 : 0);
			}
		}
	});

	it(`leaves external captures outside component rollback (${target})`, async () => {
		const { compiled, runtime } = await privateHelperArtifact(
			'export const external={count:0};export function work(state:{count:number}){external.count++;state.count++;}',
			target
		);
		const root = runtime.reactive({ count: 0 });
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.helper(compiled.work)(root);
		expect(root.count).toBe(0);
		expect((compiled.external as { count: number }).count).toBe(1);
		pending.discard();
		expect(root.count).toBe(0);
		expect((compiled.external as { count: number }).count).toBe(1);
	});
}

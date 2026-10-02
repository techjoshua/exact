import { expect, it } from 'vitest';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { reactive } from './reactive.js';
import { stateAccess, sameStateTarget, type StateAccess } from './state-access.js';
import { createPendingReactiveTransaction } from './pending/pending-state.js';

it('lets an ordinary branded helper use explicit state access without transforming the helper', () => {
	class Counter {
		#step = 2;
		increment(state: StateAccess<{ count: number }>) {
			return state.write('count', state.read('count') + this.#step);
		}
	}
	const helper = new Counter();
	const root = reactive({ count: 0 });
	for (const settlement of ['discard', 'commit'] as const) {
		const pending = createPendingReactiveTransaction(root);
		const access = stateAccess(pending.view(root));
		expect(helper.increment(access)).toBe(2);
		expect(root.count).toBe(0);
		pending[settlement]();
		expect(root.count).toBe(settlement === 'commit' ? 2 : 0);
		expect(() => access.write('count', 3)).toThrow('closed');
		expect(() => access.read('count')).toThrow('closed');
	}
});

it('preserves readonly policy and leaves ordinary storage outside a transaction', () => {
	const raw = { count: 0 };
	const readonly = reactive(raw, { readonly: true });
	const pending = createPendingReactiveTransaction(readonly);
	try {
		expect(() => stateAccess(pending.view(readonly)).write('count', 1)).toThrow('readonly');
		expect(raw.count).toBe(0);
	} finally {
		pending.discard();
	}
	expect(stateAccess(raw).write('count', 2)).toBe(2);
	expect(raw.count).toBe(2);
	expect(stateAccess(raw).remove('count')).toBe(true);
});

it('compares storage identity explicitly without changing native equality', () => {
	const raw = { count: 0 };
	const root = reactive(raw);
	const pending = createPendingReactiveTransaction(root);
	try {
		const view = pending.view(root);
		expect(view === raw).toBe(false);
		expect(sameStateTarget(view, root)).toBe(true);
		expect(sameStateTarget(view, raw)).toBe(true);
		expect(sameStateTarget(view, { count: 0 })).toBe(false);
		expect(sameStateTarget(NaN, NaN)).toBe(true);
		expect(sameStateTarget(0, -0)).toBe(false);
	} finally {
		pending.discard();
	}
});

it('rejects owned class methods before effects and permits the same class as an ordinary helper', () => {
	let calls = 0;
	class Counter {
		#step = 2;
		increment(state: { count: number }) {
			calls++;
			state.count += this.#step;
		}
	}
	const helper = new Counter();
	const root = reactive({ count: 0, helper });
	const pending = createPendingReactiveTransaction(root);
	try {
		pending.read(root, 'helper');
		expect(() => pending.helper(helper.increment, helper)(root)).toThrow('class receiver');
		expect(() => pending.helper(Function.prototype.call, helper.increment)(helper, root)).toThrow(
			'class receiver'
		);
		expect(() =>
			pending.helper(Function.prototype.apply, helper.increment)(helper, [root])
		).toThrow('class receiver');
		expect(() => pending.helper(Function.prototype.bind, helper.increment)(helper, root)).toThrow(
			'class receiver'
		);
		expect(calls).toBe(0);
		expect(root.count).toBe(0);
		const externalHelper = new Counter();
		pending.helper(externalHelper.increment, externalHelper)(root);
		expect(calls).toBe(1);
		expect(pending.view(root).count).toBe(2);
		expect(root.count).toBe(0);
	} finally {
		pending.discard();
	}
	expect(root.count).toBe(0);
});

it.each(['prototype', 'selected'] as const)(
	'binds an owned %s collection method to the creating invocation',
	(form) => {
		const root = reactive({ lookup: new Map<string, number>() });
		const pending = createPendingReactiveTransaction(root);
		const lookup = pending.read(root, 'lookup');
		try {
			const selected = form === 'prototype' ? Map.prototype.set : pending.read(lookup, 'set');
			const bound = pending.helper(Function.prototype.bind, selected)(lookup, 'key') as (
				value: number
			) => unknown;
			bound(2);
			expect(root.lookup.has('key')).toBe(false);
			expect(pending.view(root).lookup.get('key')).toBe(2);
			pending.commit();
			expect(root.lookup.get('key')).toBe(2);
			expect(() => bound(3)).toThrow('closed');
		} finally {
			pending.discard();
		}
	}
);

it('eliminates unused bridges from production bundles independently', async () => {
	const bundle = async (source: string, minify = false) => {
		const result = await build({
			stdin: { contents: source, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
			bundle: true,
			write: false,
			format: 'esm',
			platform: 'browser',
			metafile: true,
			treeShaking: true,
			minify
		});
		return { code: result.outputFiles[0]!.text, outputs: result.metafile!.outputs };
	};
	const { code: unused } = await bundle(
		'import { stateAccess, sameStateTarget } from "./index.ts"; export const value = 1;'
	);
	expect(unused).not.toContain('stateAccess');
	expect(unused).not.toContain('sameStateTarget');
	// A used barrel export must not pull in optional bridges, including after name minification.
	const liveReactive = await bundle('export { reactive } from "./index.ts";', true);
	for (const output of Object.values(liveReactive.outputs)) {
		for (const [input, contribution] of Object.entries(output.inputs)) {
			if (input.endsWith('/state-access.ts')) expect(contribution.bytesInOutput).toBe(0);
		}
	}
	expect(liveReactive.code).toContain('reactive');
	const { code: access } = await bundle('export { stateAccess } from "./index.ts";');
	expect(access).toContain('function stateAccess');
	expect(access).not.toContain('function sameStateTarget');
	expect(access).not.toContain('createPendingReactiveTransaction');
	const { code: identity } = await bundle('export { sameStateTarget } from "./index.ts";');
	expect(identity).toContain('function sameStateTarget');
	expect(identity).not.toContain('function stateAccess');
	expect(identity).not.toContain('createPendingReactiveTransaction');
});

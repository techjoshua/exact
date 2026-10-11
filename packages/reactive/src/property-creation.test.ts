import { expect, it } from 'vitest';
import { batch, flushSync, reactive, watch } from './index.js';
import { reactiveObjects } from './framework/objects.js';

for (const [name, wrap] of [
	['general', reactive],
	['compiled object/array', reactiveObjects]
] as const) {
	for (const [kind, create, key] of [
		['object property', () => ({}), 'missing'],
		['array hole', () => new Array(1), '0'],
		['array extension', () => [], '1']
	] as const) {
		it(`publishes undefined ${kind} creation and rollback through ${name}`, () => {
			const target = create();
			const state = wrap(target) as Record<string, unknown>;
			const snapshots: Array<{ keys: PropertyKey[]; exists: boolean; length: unknown }> = [];
			const stop = watch(() =>
				snapshots.push({ keys: Reflect.ownKeys(state), exists: key in state, length: state.length })
			);
			try {
				const originalLength = Array.isArray(target) ? target.length : undefined;
				expect(() =>
					batch(() => {
						state[key] = undefined;
						throw new Error('rollback');
					})
				).toThrow('rollback');
				flushSync();
				expect(Object.hasOwn(state, key)).toBe(false);
				expect(snapshots).toHaveLength(1);
				state[key] = undefined;
				flushSync();
				expect(snapshots.at(-1)?.keys).toContain(key);
				expect(snapshots.at(-1)?.exists).toBe(true);
				if (Array.isArray(target))
					expect(snapshots.at(-1)?.length).toBe(Math.max(originalLength!, Number(key) + 1));
				state[key] = 2;
				flushSync();
				expect(state[key]).toBe(2);
				delete state[key];
				flushSync();
				expect(snapshots.at(-1)?.exists).toBe(false);
				expect(snapshots.at(-1)?.keys).not.toContain(key);
			} finally {
				stop();
			}
		});
	}
}

it.each([
	['Map', () => new Map()],
	['Set', () => new Set()]
] as const)('publishes undefined public-property creation on %s receivers', (_name, create) => {
	const state = reactive(create()) as unknown as { note?: number };
	let keys: PropertyKey[] = [];
	const stop = watch(() => {
		keys = Reflect.ownKeys(state);
	});
	try {
		state.note = undefined;
		flushSync();
		expect(keys).toContain('note');
		delete state.note;
		flushSync();
		expect(keys).not.toContain('note');
	} finally {
		stop();
	}
});

it('publishes equal-value shadowing while retaining the inherited value and rollback ownership', () => {
	class Values extends Array<number> {
		declare label: string;
	}
	Object.defineProperty(Values.prototype, 'label', {
		value: 'initial',
		writable: true,
		configurable: true
	});
	const state = reactive(new Values());
	let keys: PropertyKey[] = [];
	const stop = watch(() => {
		keys = Reflect.ownKeys(state);
	});
	try {
		expect(() =>
			batch(() => {
				state.label = 'initial';
				throw new Error('rollback');
			})
		).toThrow('rollback');
		flushSync();
		expect(Object.hasOwn(state, 'label')).toBe(false);
		expect(keys).not.toContain('label');
		state.label = 'initial';
		flushSync();
		expect(Object.hasOwn(state, 'label')).toBe(true);
		expect(keys).toContain('label');
		state.label = 'updated';
		flushSync();
		expect(state.label).toBe('updated');
		expect(Values.prototype.label).toBe('initial');
		delete (state as { label?: string }).label;
		flushSync();
		expect(state.label).toBe('initial');
		expect(keys).not.toContain('label');
	} finally {
		stop();
	}
});

it('leaves enumeration unchanged for unchanged own writes and rejects readonly creation', () => {
	const state = reactive({ value: undefined });
	let runs = 0;
	const stop = watch(() => {
		Reflect.ownKeys(state);
		runs++;
	});
	try {
		state.value = undefined;
		flushSync();
		expect(runs).toBe(1);
	} finally {
		stop();
	}
	const readonly = reactive({} as { missing?: unknown }, { readonly: true });
	expect(() => {
		readonly.missing = undefined;
	}).toThrow(TypeError);
	expect(Object.hasOwn(readonly, 'missing')).toBe(false);
});

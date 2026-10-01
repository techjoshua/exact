import { expect, it } from 'vitest';
import { reactive, flushSync, watch } from '@exactjs/reactive';
import { createTaskState } from './pending-state.js';
import { publishTaskMutations } from './resources.js';

it('lets unchanged helpers observe pending writes, stable aliases and descriptor reads', () => {
	const shared = { count: 0 };
	const root = reactive({ first: shared, second: shared, count: 0 } as {
		first: typeof shared;
		second: typeof shared;
		count: number;
		added?: number;
	});
	function external(owner: typeof root, repeated: typeof root) {
		expect(owner).toBe(repeated);
		expect(owner.first).toBe(owner.second);
		owner.first.count++;
		owner.count = owner.first.count;
		owner.added = 9;
		expect(Object.keys(owner)).toContain('added');
		expect(Object.getOwnPropertyDescriptor(owner, 'count')!.value).toBe(1);
		expect({ ...owner }.added).toBe(9);
		delete owner.added;
		expect('added' in owner).toBe(false);
		return owner;
	}
	const signal = new AbortController().signal,
		context = createTaskState(signal, root);
	expect(context.helper(external)(root, root)).toBe(root);
	expect(root.count).toBe(0);
	expect(root.first.count).toBe(0);
	publishTaskMutations(signal);
	expect(root.count).toBe(1);
	expect(root.first.count).toBe(1);
	expect(root.added).toBeUndefined();
});

it('preserves native collection results, callback receivers and iteration in unchanged helpers', () => {
	const root = reactive({
		values: [1],
		lookup: new Map<string, number>(),
		members: new Set<number>()
	});
	function external(owner: typeof root) {
		expect(owner.values.push(2)).toBe(2);
		expect(owner.values.length).toBe(2);
		expect(owner.values.reverse()).toBe(owner.values);
		expect(owner.lookup.set('x', 9)).toBe(owner.lookup);
		expect(owner.lookup.get('x')).toBe(9);
		expect(owner.members.add(9)).toBe(owner.members);
		owner.values.forEach((_value, _index, values) => expect(values).toBe(owner.values));
		owner.lookup.forEach((_value, _key, lookup) => expect(lookup).toBe(owner.lookup));
		expect([...owner.values]).toEqual([2, 1]);
		expect([...owner.lookup]).toEqual([['x', 9]]);
		expect([...owner.members]).toEqual([9]);
	}
	const signal = new AbortController().signal,
		context = createTaskState(signal, root);
	context.helper(external)(root);
	expect(root.values).toEqual([1]);
	expect(root.lookup.size).toBe(0);
	expect(root.members.size).toBe(0);
	publishTaskMutations(signal);
	expect(root.values).toEqual([2, 1]);
	expect(root.lookup.get('x')).toBe(9);
	expect(root.members.has(9)).toBe(true);
});

it('fences unchanged asynchronous helper writes after cancellation and retains cleanup', async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const root = reactive({ count: 0 }),
		controller = new AbortController();
	const context = createTaskState(controller.signal, root);
	const log: string[] = [];
	async function external(owner: typeof root) {
		try {
			owner.count = 1;
			await gate;
			owner.count++;
			log.push('after');
			return owner;
		} finally {
			log.push('finally');
		}
	}
	const result = context.helper(external)(root) as Promise<typeof root>;
	expect(root.count).toBe(0);
	controller.abort();
	release();
	await expect(result).rejects.toThrow();
	expect(root.count).toBe(0);
	expect(log).toEqual(['finally']);
});

it('runs ordinary accessors against the pending facade and publishes their dependent fields', () => {
	const root = reactive({
		stored: 0,
		get count() {
			return this.stored;
		},
		set count(value: number) {
			this.stored = value * 2;
		}
	});
	const observed: number[] = [];
	const stop = watch(() => observed.push(root.stored));
	try {
		const signal = new AbortController().signal,
			context = createTaskState(signal, root);
		context.helper((owner: typeof root) => {
			owner.count = 3;
			expect(owner.count).toBe(6);
		})(root);
		expect(root.stored).toBe(0);
		publishTaskMutations(signal);
		flushSync();
		expect(observed).toEqual([0, 6]);
	} finally {
		stop();
	}
});

it('keeps references stored by a helper usable after publication and a later cancellation', () => {
	const root = reactive({
		inner: { count: 0 },
		saved: undefined as { ref: { count: number } } | undefined
	});
	const controller = new AbortController(),
		context = createTaskState(controller.signal, root);
	context.helper((owner: typeof root) => {
		owner.saved = { ref: owner.inner };
		owner.inner.count = 3;
	})(root);
	publishTaskMutations(controller.signal);
	controller.abort();
	root.saved!.ref.count = 4;
	expect(root.inner.count).toBe(4);
	const next = new AbortController(),
		current = createTaskState(next.signal, root);
	current.helper((owner: typeof root) => {
		owner.saved!.ref.count = 5;
	})(root);
	expect(root.inner.count).toBe(4);
	publishTaskMutations(next.signal);
	expect(root.inner.count).toBe(5);
});

it('normalizes object keys while preserving pending Map and Set membership', () => {
	const key = { count: 0 };
	const root = reactive({ lookup: new Map([[key, 1]]), members: new Set([key]) });
	const controller = new AbortController(),
		context = createTaskState(controller.signal, root);
	context.helper((owner: typeof root) => {
		for (const entry of owner.lookup.keys()) {
			expect(owner.lookup.get(entry)).toBe(1);
			owner.lookup.set(entry, 2);
			expect(owner.lookup.get(entry)).toBe(2);
		}
		for (const entry of owner.members) expect(owner.members.has(entry)).toBe(true);
	})(root);
	publishTaskMutations(controller.signal);
	expect(root.lookup.get(key)).toBe(2);
});

it('keeps descriptor-selected object mutations pending and publishes their notifications', () => {
	const root = reactive({ nested: { count: 0 } });
	const seen: number[] = [];
	const stop = watch(() => seen.push(root.nested.count));
	try {
		const controller = new AbortController();
		const pending = createTaskState(controller.signal, root);
		pending.helper((owner: typeof root) => {
			const descriptor = Object.getOwnPropertyDescriptor(owner, 'nested')!;
			descriptor.value.count = 9;
			expect(descriptor.value).toBe(owner.nested);
		})(root);
		expect(root.nested.count).toBe(0);
		publishTaskMutations(controller.signal);
		flushSync();
		expect(seen).toEqual([0, 9]);
	} finally {
		stop();
	}
});

it('rejects readonly accessors before effects and unsupported private brands before execution', () => {
	let effects = 0;
	const root = reactive(
		{
			get count() {
				return 0;
			},
			set count(value: number) {
				effects += value;
			}
		},
		{ readonly: true }
	);
	const context = createTaskState(new AbortController().signal, root);
	expect(() =>
		context.helper((owner: typeof root) => {
			owner.count = 1;
		})(root)
	).toThrow('readonly');
	expect(effects).toBe(0);
	class Private {
		#count = 0;
		change() {
			effects++;
			return ++this.#count;
		}
	}
	const branded = reactive({ value: new Private() });
	const other = createTaskState(new AbortController().signal, branded);
	expect(() => other.helper((owner: typeof branded) => owner.value.change())(branded)).toThrow(
		'private brands'
	);
	expect(effects).toBe(0);
});

it('accepts reflection with the pending receiver and rejects receiver substitution before effects', () => {
	let reads = 0;
	const root = reactive({
		stored: 0,
		get count() {
			reads++;
			return this.stored;
		},
		set count(value: number) {
			this.stored = value;
		}
	});
	const controller = new AbortController();
	const pending = createTaskState(controller.signal, root);
	pending.helper((owner: typeof root) => {
		expect(Reflect.set(owner, 'count', 9, owner)).toBe(true);
		expect(Reflect.get(owner, 'count', owner)).toBe(9);
		const priorReads = reads;
		expect(() => Reflect.get(owner, 'count', {})).toThrow('original receiver');
		expect(reads).toBe(priorReads);
		expect(() => Reflect.set(owner, 'count', 10, {})).toThrow('original receiver');
		expect(owner.count).toBe(9);
	})(root);
	expect(root.stored).toBe(0);
	publishTaskMutations(controller.signal);
	expect(root.stored).toBe(9);
});

it('closes escaped accessor writes before effects when task publication finishes', () => {
	let effects = 0;
	const root = reactive({
		stored: 0,
		set count(value: number) {
			effects++;
			this.stored = value;
		}
	});
	const controller = new AbortController();
	const pending = createTaskState(controller.signal, root);
	let escaped!: typeof root;
	pending.helper((owner: typeof root) => {
		escaped = owner;
		owner.count = 1;
	})(root);
	publishTaskMutations(controller.signal);
	expect(root.stored).toBe(1);
	expect(effects).toBe(1);
	expect(() => {
		escaped.count = 2;
	}).toThrow('closed');
	expect(effects).toBe(1);
	expect(root.stored).toBe(1);
});

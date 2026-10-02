import { expect, it } from 'vitest';
import { createPendingReactiveTransaction } from './pending-state.js';
import { registerPendingReactiveHelper } from './helper-variants.js';

it('copies compiled getter results without changing reference or callable identity', () => {
	const state = { count: 0, items: [1] };
	const callable = () => 1;
	const source = {
		callable,
		get items() {
			state.count++;
			return state.items;
		}
	};
	const getter = Object.getOwnPropertyDescriptor(source, 'items')!.get!;
	registerPendingReactiveHelper(
		getter,
		(context) => {
			context.write(state, 'count', Number(context.read(state, 'count')) + 1);
			return state.items;
		},
		false,
		undefined,
		undefined,
		source
	);
	const root = { state };
	for (const settlement of ['discard', 'commit'] as const) {
		const pending = createPendingReactiveTransaction(root);
		pending.read(root, 'state');
		const copy = { ...pending.view(source, true) };
		expect(copy.items).toBe(state.items);
		expect(copy.callable).toBe(callable);
		expect(state.count).toBe(0);
		pending[settlement]();
		expect(state.count).toBe(settlement === 'commit' ? 1 : 0);
	}
});

it('retains external proxy read semantics without descriptor inspection', () => {
	const target = new Proxy(
		{ value: 3 },
		{
			getOwnPropertyDescriptor() {
				throw new Error('unexpected reflection');
			}
		}
	);
	const pending = createPendingReactiveTransaction({});
	try {
		expect(pending.read(target, 'value')).toBe(3);
	} finally {
		pending.discard();
	}
});

it('copies frozen nested references and original functions from owned sources', () => {
	const nested = { value: 1 };
	const callable = () => 1;
	const source = Object.freeze({ nested, callable });
	const root = { source };
	const pending = createPendingReactiveTransaction(root);
	pending.read(root, 'source');
	try {
		const copy = { ...pending.view(source, true) };
		expect(copy.nested).toBe(nested);
		expect(copy.callable).toBe(callable);
	} finally {
		pending.discard();
	}
});

it('preserves custom source key order during native copying', () => {
	const events: PropertyKey[] = [];
	const source = new Proxy(
		{ '0': 1, '1': 2 },
		{
			ownKeys: () => ['1', '0'],
			get(target, key, receiver) {
				if (key === '0' || key === '1') events.push(key);
				return Reflect.get(target, key, receiver);
			}
		}
	);
	const pending = createPendingReactiveTransaction({});
	try {
		const copy = { ...pending.view(source, true) };
		expect(copy).toEqual({ '0': 1, '1': 2 });
		expect(events).toEqual(['1', '0']);
	} finally {
		pending.discard();
	}
});

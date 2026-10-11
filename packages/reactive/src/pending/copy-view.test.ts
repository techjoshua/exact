import { expect, it } from 'vitest';
import { createPendingReactiveTransaction } from './pending-state.js';

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

import { expect, it } from 'vitest';
import { createPendingReactiveTransaction } from './pending-state.js';
import { registerPendingReactiveHelper } from './helper-variants.js';

it('selects current captures for a compiled method on external storage', () => {
	const owner = { value: 0 };
	const root = { owner };
	const source = {
		work() {
			return ++owner.value;
		}
	};
	registerPendingReactiveHelper(source.work, (context) =>
		context.write(owner, 'value', Number(context.read(owner, 'value')) + 1)
	);
	for (const settlement of ['discard', 'commit'] as const) {
		const pending = createPendingReactiveTransaction(root);
		pending.read(root, 'owner');
		try {
			expect(pending.method(source, 'work')()).toBe(1);
			expect(owner.value).toBe(0);
			pending[settlement]();
			expect(owner.value).toBe(settlement === 'commit' ? 1 : 0);
		} finally {
			pending.discard();
		}
	}
});

it('selects a compiled getter and its returned method once', () => {
	const owner = { value: 0 };
	const root = { owner };
	const work = () => ++owner.value;
	const source = {
		get work() {
			owner.value++;
			return work;
		}
	};
	registerPendingReactiveHelper(work, (context) =>
		context.write(owner, 'value', Number(context.read(owner, 'value')) + 1)
	);
	registerPendingReactiveHelper(
		Object.getOwnPropertyDescriptor(source, 'work')!.get!,
		(context) => {
			context.write(owner, 'value', Number(context.read(owner, 'value')) + 1);
			return work;
		},
		false,
		undefined,
		undefined,
		source
	);
	const pending = createPendingReactiveTransaction(root);
	pending.read(root, 'owner');
	try {
		expect(pending.method(source, 'work')()).toBe(2);
		expect(pending.read(owner, 'value')).toBe(2);
		expect(owner.value).toBe(0);
	} finally {
		pending.discard();
	}
});

it('retains explicit method selection without evaluating an external getter', () => {
	const original = () => 1;
	registerPendingReactiveHelper(original, () => 2);
	const source = {
		get work() {
			throw new Error('unexpected selection');
		}
	};
	const pending = createPendingReactiveTransaction({});
	try {
		expect(pending.method(source, 'work', original)()).toBe(2);
	} finally {
		pending.discard();
	}
});

it('evaluates an unknown noncallable external getter once before invocation fails', () => {
	let reads = 0;
	const source = {
		get work() {
			reads++;
			return undefined;
		}
	};
	const pending = createPendingReactiveTransaction({});
	try {
		expect(() => pending.method(source, 'work')()).toThrow(TypeError);
		expect(reads).toBe(1);
	} finally {
		pending.discard();
	}
});

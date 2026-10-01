import { expect, it } from 'vitest';
import { reactive } from '../reactive.js';
import { createPendingReactiveTransaction } from './pending-state.js';
import { registerPendingReactiveHelper } from './helper-variants.js';
import type { PendingReactiveState } from './pending-state-contract.js';

it('preserves an external readonly receiver when a compiled helper calls unchanged code', () => {
	class Values extends Array<number> {
		value = 0;
		step() {
			return ++this.value;
		}
	}
	function external(this: Values) {
		return ++this.value;
	}
	registerPendingReactiveHelper(
		Values.prototype.step,
		function (this: Values, context) {
			return context.helper(external, this)();
		},
		true
	);
	const raw = new Values(),
		readonly = reactive(raw, { readonly: true }),
		writable = reactive(raw);
	const pending = createPendingReactiveTransaction({});
	expect(() => pending.helper(Values.prototype.step, readonly)()).toThrow(TypeError);
	expect(raw.value).toBe(0);
	expect(pending.helper(Values.prototype.step, writable)()).toBe(1);
	pending.discard();
	expect(raw.value).toBe(1);
});

it('preserves an external readonly argument when a compiled helper calls unchanged code', () => {
	class Values extends Array<number> {
		value = 0;
		step() {
			return ++this.value;
		}
	}
	function external(owner: Values) {
		return ++owner.value;
	}
	registerPendingReactiveHelper(
		Values.prototype.step,
		function (this: Values, context) {
			return context.helper(external)(this);
		},
		true
	);
	const raw = new Values(),
		readonly = reactive(raw, { readonly: true }),
		writable = reactive(raw);
	const pending = createPendingReactiveTransaction({});
	expect(() => pending.helper(Values.prototype.step, readonly)()).toThrow(TypeError);
	expect(raw.value).toBe(0);
	expect(pending.helper(Values.prototype.step, writable)()).toBe(1);
	pending.discard();
	expect(raw.value).toBe(1);
});

it('retains readonly arguments in escaped bindings to unchanged helpers', () => {
	class Values extends Array<number> {
		value = 0;
		bound() {
			return () => ++this.value;
		}
	}
	function external(owner: Values) {
		return ++owner.value;
	}
	registerPendingReactiveHelper(
		Values.prototype.bound,
		function (this: Values, context) {
			return context.helper(Function.prototype.bind, external)(undefined, this);
		},
		true
	);
	const raw = new Values(),
		readonly = reactive(raw, { readonly: true }),
		writable = reactive(raw);
	const first = createPendingReactiveTransaction({});
	const denied = first.helper(Values.prototype.bound, readonly)(),
		allowed = first.helper(Values.prototype.bound, writable)();
	first.discard();
	const next = createPendingReactiveTransaction({});
	expect(() => next.helper(denied)()).toThrow(TypeError);
	expect(raw.value).toBe(0);
	expect(next.helper(allowed)()).toBe(1);
	next.discard();
	expect(raw.value).toBe(1);
});

for (const write of ['private', 'property', 'array', 'delete'] as const)
	for (const crossReceiver of [false, true])
		for (const owned of [true, false])
			it(`retains readonly aliases through nested ${write} work, cross receiver=${crossReceiver}, owned=${owned}`, () => {
				const token = {};
				class Values extends Array<number> {
					#count = 0;
					value = 0;
					get count() {
						return this.#count;
					}
					increment() {
						return ++this.#count;
					}
					step() {
						return this.increment();
					}
					static read(owner: Values) {
						return owner.#count;
					}
					static write(owner: Values, value: number) {
						owner.#count = value;
					}
				}
				registerPendingReactiveHelper(
					Values.prototype.increment,
					function (this: Values, context) {
						if (write === 'private') {
							const value = context.privateRead(this, token, Values.read) + 1;
							return context.privateWrite(this, token, value, Values.write, Values.read);
						}
						if (write === 'property')
							return context.write(this, 'value', Number(context.read(this, 'value')) + 1);
						if (write === 'delete') return context.remove(this, 'value') ? 1 : 0;
						return context.call(this, 'push', [1]);
					},
					true
				);
				const raw = new Values(),
					other = new Values();
				const readonly = reactive(raw, { readonly: true }),
					writable = reactive(raw);
				function bridge(this: Values, owner: Values) {
					return owner.increment();
				}
				registerPendingReactiveHelper(
					bridge,
					function (this: Values, context, owner: Values) {
						return context.helper(Values.prototype.increment, owner)();
					},
					true
				);
				registerPendingReactiveHelper(
					Values.prototype.step,
					function (this: Values, context) {
						return crossReceiver
							? context.helper(bridge, other)(this)
							: context.helper(Values.prototype.increment, this)();
					},
					true
				);
				const root = { readonly, writable, other };
				const pending = createPendingReactiveTransaction(root);
				if (owned) {
					pending.read(root, 'readonly');
					pending.read(root, 'writable');
					pending.read(root, 'other');
				}
				expect(() => pending.helper(Values.prototype.step, readonly)()).toThrow('readonly');
				expect([raw.count, raw.value, raw.length]).toEqual([0, 0, 0]);
				// A separately selected writable alias remains writable, even after the rejected alias.
				expect(pending.helper(Values.prototype.step, writable)()).toBe(1);
				if (owned) expect([raw.count, raw.value, raw.length]).toEqual([0, 0, 0]);
				pending.commit();
				expect([raw.count, raw.value, raw.length]).toEqual(
					write === 'private'
						? [1, 0, 0]
						: write === 'property'
							? [0, 1, 0]
							: write === 'delete'
								? [0, undefined, 0]
								: [0, 0, 1]
				);
			});

it('inherits lexical super home from an already registered private companion', () => {
	class Base {
		get value() {
			return 7;
		}
	}
	class Home extends Base {}
	class Child extends Home {
		override get value() {
			return 99;
		}
	}
	function original(this: Home) {
		return Reflect.get(Base.prototype, 'value', this);
	}
	registerPendingReactiveHelper(
		Object.getOwnPropertyDescriptor(Base.prototype, 'value')!.get!,
		() => 7,
		true
	);
	const work = function (this: Home, context: PendingReactiveState) {
		return context.superRead(this, 'value');
	};
	registerPendingReactiveHelper(work, work, true, undefined, undefined, Home.prototype);
	const registered = registerPendingReactiveHelper(original, work, true);
	const counter = new Child(),
		root = { counter };
	expect(registered).toBe(original);
	expect(original.call(counter)).toBe(7);
	const pending = createPendingReactiveTransaction(root);
	pending.read(root, 'counter');
	expect(pending.helper(original, counter)()).toBe(7);
	pending.discard();
});

for (const owned of [true, false])
	it(`publishes a writable native collection alias after retaining its readonly view, owned=${owned}`, () => {
		const raw = new Map<string, number>();
		const readonly = reactive(raw, { readonly: true }),
			writable = reactive(raw);
		function assign(this: Map<string, number>) {
			return this.set('x', 1);
		}
		registerPendingReactiveHelper(
			assign,
			function (this: Map<string, number>, context) {
				return context.call(this, 'set', ['x', 1]);
			},
			true
		);
		const root = { readonly, writable },
			pending = createPendingReactiveTransaction(root);
		if (owned) {
			pending.read(root, 'readonly');
			pending.read(root, 'writable');
		}
		expect(() => pending.helper(assign, readonly)()).toThrow('readonly');
		pending.helper(assign, writable)();
		expect(raw.has('x')).toBe(!owned);
		pending.commit();
		expect(raw.get('x')).toBe(1);
	});

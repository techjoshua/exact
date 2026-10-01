import { expect, it } from 'vitest';
import { reactive } from '../reactive.js';
import { registerPendingReactiveHelper } from './helper-variants.js';
import { createPendingReactiveTransaction } from './pending-state.js';

for (const readonlyFirst of [false, true])
	it(`retains extracted receiver policy after another alias is cached, readonly first=${readonlyFirst}`, () => {
		class Values extends Array<number> {
			value = 0;
			step() {
				return ++this.value;
			}
			extract() {
				return this.step;
			}
		}
		registerPendingReactiveHelper(
			Values.prototype.step,
			function (this: Values, context) {
				return context.write(this, 'value', Number(context.read(this, 'value')) + 1);
			},
			true
		);
		registerPendingReactiveHelper(
			Values.prototype.extract,
			function (this: Values, context) {
				return context.read(this, 'step');
			},
			true
		);
		const raw = new Values(),
			readonly = reactive(raw, { readonly: true }),
			writable = reactive(raw),
			root = { readonly, writable };
		const first = createPendingReactiveTransaction(root);
		first.read(root, 'readonly');
		first.read(root, 'writable');
		first.read(writable, 'step');
		const aliases = readonlyFirst ? [readonly, writable] : [writable, readonly];
		const work = aliases.map((alias) => first.helper(Values.prototype.extract, alias)());
		first.discard();
		const next = createPendingReactiveTransaction(root);
		next.read(root, 'readonly');
		next.read(root, 'writable');
		const denied = work[readonlyFirst ? 0 : 1],
			allowed = work[readonlyFirst ? 1 : 0];
		expect(() => next.helper(denied)()).toThrow('readonly');
		expect(raw.value).toBe(0);
		expect(next.helper(allowed)()).toBe(1);
		expect(raw.value).toBe(0);
		next.commit();
		expect(raw.value).toBe(1);
	});

for (const kind of ['Array', 'Map'] as const)
	it(`selects the current transaction for an extracted native ${kind} operation`, () => {
		const value = kind === 'Array' ? [] : new Map<string, number>(),
			root = { value };
		const first = createPendingReactiveTransaction(root);
		first.read(root, 'value');
		const work = first.read(value, kind === 'Array' ? 'push' : 'set');
		first.discard();
		expect(() =>
			Reflect.apply(
				work as (...args: unknown[]) => unknown,
				value,
				kind === 'Array' ? [1] : ['x', 1]
			)
		).toThrow('closed');
		const next = createPendingReactiveTransaction(root);
		next.read(root, 'value');
		next.helper(work)(...(kind === 'Array' ? [1] : ['x', 1]));
		expect(
			kind === 'Array' ? (value as unknown[]).length : (value as Map<string, number>).size
		).toBe(0);
		next.commit();
		expect(
			kind === 'Array' ? (value as unknown[]).length : (value as Map<string, number>).size
		).toBe(1);
	});

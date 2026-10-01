import { expect, it } from 'vitest';
import { reactive, watch, flushSync, computed } from '@exactjs/reactive';
import { createTaskState, type CompiledTaskState } from './pending-state.js';
import { registerTaskHelper } from './helper-variants.js';
import { publishTaskMutations } from './resources.js';

it('keeps original callable identity, arity and ordinary calls while selecting owned helper work', () => {
	function assign(owner: { count: number }, value = 2) {
		owner.count = value;
		return owner;
	}
	const original = registerTaskHelper(assign, (context, owner: { count: number }, value = 2) => {
		context.write(owner, 'count', value);
		return owner;
	});
	expect(original).toBe(assign);
	expect(original.length).toBe(1);
	const ordinary = { count: 0 };
	expect(original(ordinary)).toBe(ordinary);
	expect(ordinary.count).toBe(2);
	const root = reactive({ nested: { count: 0 } });
	const controller = new AbortController(),
		context = createTaskState(controller.signal, root);
	const nested = context.read(root, 'nested') as typeof root.nested;
	expect(context.helper(original)(nested, 9)).toBe(nested);
	expect(context.read(nested, 'count')).toBe(9);
	expect(nested.count).toBe(0);
	publishTaskMutations(controller.signal);
	expect(nested.count).toBe(9);
});

it('preserves class private brands and accessor relationships through pending companion work', () => {
	const key = {};
	class Counter extends Array<number> {
		#count = 0;
		get count() {
			return this.#count;
		}
		set count(value: number) {
			this.#count = value;
		}
		static {
			const descriptor = Object.getOwnPropertyDescriptor(this.prototype, 'count')!;
			registerTaskHelper(
				descriptor.get!,
				function (this: Counter, context: CompiledTaskState) {
					return context.privateRead(this, key, (owner) => owner.#count);
				},
				true
			);
			registerTaskHelper(
				descriptor.set!,
				function (this: Counter, context: CompiledTaskState, value: number) {
					context.privateWrite(
						this,
						key,
						value,
						(owner, next) => {
							owner.#count = next;
						},
						(owner) => owner.#count
					);
				},
				true
			);
		}
	}
	const root = reactive({ counter: new Counter() });
	const controller = new AbortController(),
		context = createTaskState(controller.signal, root);
	const counter = context.read(root, 'counter') as Counter;
	const selected = computed(() => counter.count);
	expect(selected.get()).toBe(0);
	const observed: number[] = [];
	const stop = watch(() => observed.push(counter.count));
	expect(context.write(counter, 'count', 9)).toBe(9);
	expect(context.read(counter, 'count')).toBe(9);
	expect(counter.count).toBe(0);
	publishTaskMutations(controller.signal);
	expect(root.counter).toBe(counter);
	expect(counter.count).toBe(9);
	expect(selected.get()).toBe(9);
	flushSync();
	stop();
	expect(observed).toEqual([0, 9]);
});

it('fences a suspended helper body after replacement without changing its argument identity', async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const root = reactive({ count: 0 });
	async function assign(owner: typeof root) {
		await gate;
		owner.count = 9;
	}
	registerTaskHelper(assign, async (context, owner: typeof root) => {
		expect(owner).toBe(root);
		await context.await(gate);
		context.write(owner, 'count', 9);
	});
	const controller = new AbortController(),
		context = createTaskState(controller.signal, root);
	const outcome = Promise.resolve(context.helper(assign)(root)).catch((error) => error);
	controller.abort();
	release();
	expect(await outcome).toBeInstanceOf(Error);
	publishTaskMutations(controller.signal);
	expect(root.count).toBe(0);
});

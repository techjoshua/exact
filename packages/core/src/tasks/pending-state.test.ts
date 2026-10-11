import { expect, it } from 'vitest';
import { reactive, flushSync, unwrap } from '@exactjs/reactive';
import { createTaskState } from './pending-state.js';
import { discardTaskMutations, publishTaskMutations } from './resources.js';

it.each(['publish', 'discard'] as const)('closes read-only task journals after %s', (settle) => {
	const root = reactive({ count: 0, map: new Map([['x', 1]]) });
	const controller = new AbortController();
	const pending = createTaskState(controller.signal, root);
	const view = pending.view(root);
	const map = pending.read(root, 'map') as object;
	const iterator = pending.call(map, 'values', []) as Iterator<number>;
	expect(iterator.next().value).toBe(1);
	if (settle === 'publish') publishTaskMutations(controller.signal);
	else discardTaskMutations(controller.signal);
	expect(() => pending.write(root, 'count', 9)).toThrow('closed');
	expect(() => {
		view.count = 9;
	}).toThrow('closed');
	expect(() => iterator.next()).toThrow('closed');
	expect(root.count).toBe(0);
	const next = new AbortController();
	createTaskState(next.signal, root).write(root, 'count', 1);
	publishTaskMutations(next.signal);
	expect(root.count).toBe(1);
});

it('keeps Map reads and results coherent until publication without changing receiver identity', () => {
	const root = reactive({ map: new Map<string, number>(), trace: '' });
	const controller = new AbortController();
	const pending = createTaskState(controller.signal, root);
	const map = pending.read(root, 'map') as typeof root.map;
	expect(pending.call(map, 'set', ['x', 9])).toBe(map);
	expect(pending.call(map, 'get', ['x'])).toBe(9);
	expect(pending.read(map, 'size')).toBe(1);
	expect(root.map.size).toBe(0);
	pending.write(root, 'trace', String(pending.call(map, 'get', ['x'])));
	expect(root.trace).toBe('');
	publishTaskMutations(controller.signal);
	flushSync();
	expect(root.map).toBe(map);
	expect(root.map.get('x')).toBe(9);
	expect(root.trace).toBe('9');
});

it('discards stale edits and preserves a separate successful invocation', () => {
	const root = reactive({ map: new Map<string, number>() });
	const stale = new AbortController(),
		current = new AbortController();
	const first = createTaskState(stale.signal, root),
		second = createTaskState(current.signal, root);
	first.call(first.read(root, 'map') as object, 'set', ['x', 1]);
	second.call(second.read(root, 'map') as object, 'set', ['x', 2]);
	stale.abort();
	expect(() => first.call(first.read(root, 'map') as object, 'set', ['x', 3])).toThrow();
	publishTaskMutations(stale.signal);
	expect(root.map.has('x')).toBe(false);
	publishTaskMutations(current.signal);
	expect(root.map.get('x')).toBe(2);
});

it('resolves pending collection edits into the reconciled published receiver', () => {
	const root = reactive({ map: new Map<string, number>([['old', 1]]) });
	const receiver = root.map;
	const controller = new AbortController(),
		pending = createTaskState(controller.signal, root);
	const next = new Map<string, number>();
	pending.write(root, 'map', next);
	expect(pending.read(root, 'map')).toBe(next);
	pending.call(next, 'set', ['x', 9]);
	publishTaskMutations(controller.signal);
	expect(unwrap(root.map)).toBe(next);
	expect([...receiver]).toEqual([['old', 1]]);
	expect([...root.map]).toEqual([['x', 9]]);
});

it('preserves Set return identity, ordered results and cancellation before publication', () => {
	const root = reactive({ members: new Set([1, 2]) });
	const controller = new AbortController(),
		pending = createTaskState(controller.signal, root);
	expect(pending.call(pending.read(root, 'members') as object, 'delete', [1])).toBe(true);
	expect(pending.call(pending.read(root, 'members') as object, 'add', [3])).toBe(root.members);
	expect([
		...(pending.call(pending.read(root, 'members') as object, 'values', []) as Iterable<unknown>)
	]).toEqual([2, 3]);
	expect([...root.members]).toEqual([1, 2]);
	discardTaskMutations(controller.signal);
	expect([...root.members]).toEqual([1, 2]);
});

it('publishes the originally selected native operation without invoking a later override', () => {
	const root = reactive({ map: new Map<string, number>() });
	const controller = new AbortController(),
		pending = createTaskState(controller.signal, root);
	pending.call(pending.read(root, 'map') as object, 'set', ['x', 9]);
	root.map.set = () => {
		throw new Error('Reselected method');
	};
	publishTaskMutations(controller.signal);
	expect(root.map.get('x')).toBe(9);
});

it('maps writes on a pending object to its reconciled published owner', () => {
	const root = reactive({ nested: { count: 0 } });
	const receiver = root.nested;
	const controller = new AbortController(),
		pending = createTaskState(controller.signal, root);
	const next = { count: 1 };
	pending.write(root, 'nested', next);
	pending.write(next, 'count', 9);
	expect(root.nested.count).toBe(0);
	publishTaskMutations(controller.signal);
	expect(root.nested).toBe(receiver);
	expect(root.nested.count).toBe(9);
});

it('retains object values and native callback receiver identity during pending iteration', () => {
	const root = reactive({ map: new Map([['x', { count: 1 }]]), members: new Set([{ count: 2 }]) });
	const controller = new AbortController(),
		pending = createTaskState(controller.signal, root);
	const map = pending.read(root, 'map') as typeof root.map;
	const value = [...(pending.call(map, 'values', []) as Iterable<{ count: number }>)][0]!;
	pending.write(value, 'count', 9);
	expect(root.map.get('x')!.count).toBe(1);
	const members = pending.read(root, 'members') as typeof root.members;
	const thisArg = {};
	pending.call(members, 'forEach', [
		function (this: object, first: unknown, second: unknown, receiver: unknown) {
			expect(this).toBe(thisArg);
			expect(first).toBe(second);
			expect(receiver).toBe(members);
		},
		thisArg
	]);
	publishTaskMutations(controller.signal);
	expect(root.map.get('x')!.count).toBe(9);
});

it('selects a native method before arguments can replace it', () => {
	const root = reactive({ map: new Map<string, number>() });
	const controller = new AbortController(),
		pending = createTaskState(controller.signal, root);
	const map = pending.read(root, 'map') as typeof root.map;
	const selected = pending.method(map, 'set');
	map.set = () => {
		throw new Error('Reselected operation');
	};
	expect(selected('x', 9)).toBe(map);
	publishTaskMutations(controller.signal);
	expect(map.get('x')).toBe(9);
});

it('keeps deletes pending and exposes an inherited value after deletion', () => {
	const nested = Object.assign(Object.create({ count: 3 }) as { count?: number }, { count: 9 });
	const root = reactive({ nested });
	const controller = new AbortController(),
		pending = createTaskState(controller.signal, root);
	const receiver = pending.read(root, 'nested') as object;
	expect(pending.remove(receiver, 'count')).toBe(true);
	expect(pending.read(receiver, 'count')).toBe(3);
	expect(root.nested.count).toBe(9);
	publishTaskMutations(controller.signal);
	expect(root.nested.count).toBe(3);
	expect(Object.hasOwn(root.nested, 'count')).toBe(false);
});

it('coerces a computed key once at selection and retains a returned Symbol', () => {
	const root = reactive({ count: 0 });
	const controller = new AbortController(),
		pending = createTaskState(controller.signal, root);
	const symbol = Symbol('key');
	let calls = 0;
	const key = pending.key({
		[Symbol.toPrimitive](hint: string) {
			expect(hint).toBe('string');
			calls++;
			return symbol;
		}
	});
	expect(key).toBe(symbol);
	pending.write(root, key, 9);
	expect(pending.read(root, key)).toBe(9);
	expect(calls).toBe(1);
	publishTaskMutations(controller.signal);
	expect(Reflect.get(root, symbol)).toBe(9);
});

it('rejects invalid owned writes during execution and preserves ordinary cleanup after cancellation', () => {
	const root = reactive({ frozen: Object.freeze({ count: 1 }) });
	const controller = new AbortController(),
		pending = createTaskState(controller.signal, root);
	expect(() => pending.write(pending.read(root, 'frozen') as object, 'count', 9)).toThrow(
		TypeError
	);
	expect(() => pending.remove(pending.read(root, 'frozen') as object, 'count')).toThrow(TypeError);
	controller.abort();
	const ordinary = { count: 1 };
	expect(pending.read(ordinary, 'count')).toBe(1);
	pending.write(ordinary, 'count', 2);
	expect(ordinary.count).toBe(2);
});

it('keeps sparse Array edits and native results pending without replacing callback receivers', () => {
	const root = reactive({ values: [1, , 3] as number[] });
	const controller = new AbortController(),
		pending = createTaskState(controller.signal, root);
	const values = pending.read(root, 'values') as number[];
	expect(pending.call(values, 'push', [4])).toBe(4);
	expect(pending.read(values, 'length')).toBe(4);
	expect(root.values.length).toBe(3);
	expect(
		pending.call(values, 'map', [
			(value: number, index: number, receiver: unknown) => {
				expect(receiver).toBe(values);
				return value + index;
			}
		])
	).toEqual([1, , 5, 7]);
	expect(pending.call(values, 'reverse', [])).toBe(values);
	expect(pending.call(values, 'join', [','])).toBe('4,3,,1');
	expect([...root.values]).toEqual([1, undefined, 3]);
	publishTaskMutations(controller.signal);
	expect(root.values).toBe(values);
	expect(values).toEqual([4, 3, , 1]);
});

it('retains Array truncation, growth and live iterators across pending writes', () => {
	const root = reactive({ values: [1, 2, 3] });
	const controller = new AbortController(),
		pending = createTaskState(controller.signal, root);
	const values = pending.read(root, 'values') as number[];
	const iterator = pending.call(values, 'values', []) as Iterator<unknown>;
	expect(iterator.next().value).toBe(1);
	pending.write(values, 'length', 1);
	pending.write(values, 'length', 3);
	expect(pending.read(values, '1')).toBeUndefined();
	expect(pending.has(values, '1')).toBe(false);
	expect(iterator.next().value).toBeUndefined();
	pending.write(values, '2', 9);
	expect(iterator.next().value).toBe(9);
	expect(values).toEqual([1, 2, 3]);
	publishTaskMutations(controller.signal);
	expect(values).toEqual([1, , 9]);
});

it('publishes a shared pending replacement into each reconciled owner', () => {
	const root = reactive({ first: { count: 0 }, second: { count: 0 } });
	const first = root.first,
		second = root.second;
	const controller = new AbortController(),
		pending = createTaskState(controller.signal, root);
	const replacement = { count: 1 };
	pending.write(root, 'first', replacement);
	pending.write(root, 'second', replacement);
	pending.write(replacement, 'count', 9);
	publishTaskMutations(controller.signal);
	expect(root.first).toBe(first);
	expect(root.second).toBe(second);
	expect(root.first.count).toBe(9);
	expect(root.second.count).toBe(9);
});

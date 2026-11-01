import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';
import { nativePatternSources } from '../test-support/native-pattern-sources.js';

type Invoke = (...args: unknown[]) => unknown;

/** Selects the existing entry explicitly so public-function execution cannot hide missing ownership. */
function owned(module: Record<string, unknown>, signal: AbortSignal): Invoke {
	const entries = Object.keys(module).filter((key) => key.startsWith('__exact_owned_'));
	expect(entries).toHaveLength(1);
	expect(Object.keys(module).sort()).toEqual([...entries, 'work'].sort());
	const entry = module[entries[0]!] as (
		signal: AbortSignal,
		receiver: unknown,
		args: unknown[]
	) => unknown;
	expect(entry.length).toBe(3);
	return (...args) => entry(signal, undefined, args);
}

it('captures a changing native receiver before its default and retains RHS result identity', async () => {
	const { authored, compiled, runtime } = await privateHelperArtifact(
		nativePatternSources['receiver-default-result'],
		'server'
	);
	for (const supplied of [false, true]) {
		const run = (invoke: Invoke) => {
			const events: string[] = [];
			const old = new Proxy([0], {
				set(target, key, value, receiver) {
					events.push(`old:${String(key)}:${value}`);
					return Reflect.set(target, key, value, receiver);
				}
			});
			const replacement = [9];
			let current = old;
			const owner = {
				replacement,
				get values() {
					events.push('select');
					return current;
				},
				set values(next) {
					events.push('replace');
					current = next;
				}
			};
			const input = [supplied ? 5 : undefined];
			const result = invoke(owner, input);
			return { result, input, owner, old, replacement, current, events };
		};
		const reference = run(authored.work as Invoke);
		const signal = new AbortController().signal;
		runtime.captureTaskPropertyMutations(signal);
		const actual = run(owned(compiled, signal));
		const writes = runtime.takeTaskPropertyMutations(signal);
		expect(actual.result).toBe(actual.input);
		expect(actual.events).toEqual(reference.events);
		expect(actual.events).toEqual(
			supplied ? ['select', 'old:0:5'] : ['select', 'replace', 'old:0:3']
		);
		expect([...actual.old]).toEqual([...reference.old]);
		expect(actual.current).toBe(supplied ? actual.old : actual.replacement);
		expect(writes?.(actual.old, '0')).toBe('set');
		expect(writes?.(actual.owner, 'values')).toBe(supplied ? undefined : 'set');
	}
});

it('leaves abrupt native iteration and partial descriptor writes with the engine', async () => {
	const { authored, compiled, runtime } = await privateHelperArtifact(
		nativePatternSources['abrupt-iterator'],
		'server'
	);
	for (const fail of [false, true]) {
		const run = (invoke: Invoke) => {
			const events: string[] = [];
			let value = 0,
				index = 9,
				count = 0;
			const child = Object.defineProperty([], '0', {
				configurable: true,
				get() {
					return index;
				},
				set(next: number) {
					events.push(`index:${next}:${this === child}`);
					if (fail) throw new Error('put');
					index = next;
				}
			});
			const owner = {
				get value() {
					return value;
				},
				set value(next: number) {
					events.push(`value:${next}`);
					value = next;
				},
				get values() {
					events.push('receiver');
					return child;
				}
			};
			const input = {
				[Symbol.iterator]() {
					return this;
				},
				next() {
					events.push(`next:${++count}`);
					return { value: undefined, done: false };
				},
				return() {
					events.push('close');
					return { done: true };
				}
			};
			let result: unknown, error: unknown;
			try {
				result = invoke(owner, input);
			} catch (caught) {
				error = caught;
			}
			return { owner, child, input, result, error, events, value, index };
		};
		const reference = run(authored.work as Invoke);
		const signal = new AbortController().signal;
		runtime.captureTaskPropertyMutations(signal);
		const actual = run(owned(compiled, signal));
		const writes = runtime.takeTaskPropertyMutations(signal);
		expect(actual.events).toEqual(reference.events);
		expect(actual.events.at(-1)).toBe('close');
		expect(actual.value).toBe(3);
		expect(actual.index).toBe(fail ? 9 : 0);
		if (fail) expect(actual.error).toMatchObject({ message: 'put' });
		else {
			expect(actual.error).toBeUndefined();
			expect(actual.result).toBe(actual.input);
		}
		expect(writes?.(actual.owner, 'value')).toBe('set');
		expect(writes?.(actual.child, '0')).toBe(fail ? undefined : 'set');
	}
});

it('fences each native put and releases old capture before an independent generation', async () => {
	const { authored, compiled, runtime } = await privateHelperArtifact(
		nativePatternSources['generation-default'],
		'server'
	);
	for (const abort of [true, false]) {
		const nativeController = new AbortController();
		const nativeOwner = {
			value: 0,
			values: [9],
			get stop() {
				if (abort) nativeController.abort('stale');
				return undefined;
			}
		};
		const nativeInput = [undefined, undefined];
		expect((authored.work as Invoke)(nativeOwner, nativeInput)).toBe(nativeInput);
		expect(nativeOwner).toMatchObject({ value: 3, values: [4] });
		const controller = new AbortController();
		const owner = {
			value: 0,
			values: [9],
			get stop() {
				if (abort) controller.abort('stale');
				return undefined;
			}
		};
		runtime.captureTaskPropertyMutations(controller.signal);
		const invoke = owned(compiled, controller.signal);
		if (abort) expect(() => invoke(owner, [undefined, undefined])).toThrow();
		else expect(invoke(owner, [undefined, undefined])).toEqual([undefined, undefined]);
		expect(owner).toMatchObject({ value: 3, values: [abort ? 9 : 4] });
		const writes = runtime.takeTaskPropertyMutations(controller.signal);
		expect(writes?.(owner, 'value')).toBe('set');
		expect(writes?.(owner.values, '0')).toBe(abort ? undefined : 'set');
		expect(runtime.takeTaskPropertyMutations(controller.signal)).toBeUndefined();
	}
});

it('owns puts without default operation nodes and preserves native assignment identity', async () => {
	const { compiled, runtime } = await privateHelperArtifact(
		nativePatternSources['pure-no-default'],
		'server'
	);
	const signal = new AbortController().signal,
		owner = { value: 0, values: [] as number[] },
		input = [3, 4];
	runtime.captureTaskPropertyMutations(signal);
	expect(owned(compiled, signal)(owner, input)).toBe(input);
	expect(owner).toEqual({ value: 3, values: [4] });
	const writes = runtime.takeTaskPropertyMutations(signal);
	expect(writes?.(owner, 'value')).toBe('set');
	expect(writes?.(owner.values, '0')).toBe('set');
});

it('keeps pending partial writes under explicit commit or discard after native close', async () => {
	const { compiled, runtime } = await privateHelperArtifact(
		nativePatternSources['abrupt-iterator'],
		'server'
	);
	for (const settlement of ['commit', 'discard'] as const) {
		const events: string[] = [];
		const owner = {
			value: 0,
			get values(): number[] {
				throw new Error('reference');
			}
		};
		const root = { owner };
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'owner');
		const input = {
			[Symbol.iterator]() {
				return this;
			},
			next() {
				return { value: undefined, done: false };
			},
			return() {
				events.push('close');
				return { done: true };
			}
		};
		expect(() => pending.helper(compiled.work)(owner, input)).toThrow('reference');
		expect(events).toEqual(['close']);
		expect(owner.value).toBe(0);
		pending[settlement]();
		expect(owner.value).toBe(settlement === 'commit' ? 3 : 0);
	}
});

import { describe, expect, it } from 'vitest';
import { flushSync, reactive, watch } from './index.js';
import type { ReactiveOptions } from './internal/types.js';

describe('reactive proxy invariants', () => {
	it('isolates mutation observation failures and retains callback options without coercing Map keys', () => {
		const receivers: unknown[] = [];
		const events: Array<[PropertyKey | undefined, string]> = [];
		const options: ReactiveOptions = {
			onMutation(key, operation) {
				receivers.push(this);
				events.push([key, operation]);
				throw new Error('diagnostic failure');
			}
		};
		const state = reactive({ value: 0 }, options);
		const array = reactive<number[]>([], options);
		const map = reactive(new Map<unknown, number>(), options);
		const set = reactive(new Set<number>(), options);
		const key = {
			[Symbol.toPrimitive]() {
				throw new Error('must not coerce');
			}
		};
		state.value = 1;
		array.push(2);
		map.set(key, 3);
		map.set('named', 4);
		set.add(5);
		expect([state.value, array[0], map.get(key), map.get('named'), set.has(5)]).toEqual([
			1,
			2,
			3,
			4,
			true
		]);
		expect(events).toEqual([
			['value', 'set'],
			[undefined, 'push'],
			[undefined, 'map.set'],
			['named', 'map.set'],
			[undefined, 'set.add']
		]);
		expect(receivers).toHaveLength(5);
		for (const receiver of receivers)
			expect(receiver).toHaveProperty('onMutation', options.onMutation);
	});

	it('keeps captured mutator callbacks attached to their original array and policy', () => {
		const first = reactive([1]);
		const second = reactive([2]);
		const readonly = reactive([3], { readonly: true });
		const pushFirst = first.push;
		const pushSecond = second.push;
		const pushReadonly = readonly.push;
		expect(pushFirst(4)).toBe(2);
		expect(pushSecond(5)).toBe(2);
		expect(() => pushReadonly(6)).toThrow('readonly');
		expect([...first]).toEqual([1, 4]);
		expect([...second]).toEqual([2, 5]);
		expect([...readonly]).toEqual([3]);
	});

	it('preserves frozen object-valued properties while observing an existing reactive value', () => {
		const state = reactive({ locale: 'en-US' });
		const metadata = { direction: 'ltr' };
		const environment = Object.freeze({ state, metadata });
		const props = reactive({ environment }, { readonly: true });
		let observed = '';

		expect(props.environment.state).toBe(state);
		expect(props.environment.metadata).toBe(metadata);
		watch(() => (observed = props.environment.state.locale));
		expect(observed).toBe('en-US');
		state.locale = 'fr-FR';
		flushSync();

		expect(observed).toBe('fr-FR');
	});
});

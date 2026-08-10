import { describe, expect, it } from 'vitest';
import { computed, flushSync, reactive, unwrap } from '@exactjs/reactive';
import { createForwardedExpression } from './vnode.js';

describe('compiled reactive expression allocation', () => {
	it('forwards an existing reactive primitive without allocating another identity', () => {
		const source = computed(() => 'value');
		expect(createForwardedExpression(() => source)).toBe(source);
	});

	it('allocates a computed value when the forwarded input is not already reactive', () => {
		const state = reactive({ value: 'first' });
		const forwarded = createForwardedExpression(() => state.value);
		expect(unwrap(forwarded)).toBe('first');

		state.value = 'second';
		flushSync();
		expect(unwrap(forwarded)).toBe('second');
	});
});

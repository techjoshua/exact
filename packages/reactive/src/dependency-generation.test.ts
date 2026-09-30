import { describe, expect, it } from 'vitest';
import {
	computed,
	createEffectScope,
	flushSync,
	inspectComputed,
	reactive,
	watch,
	withEffectScope
} from './index.js';

describe('dependency changes during reaction execution', () => {
	it.each([false, true])(
		'releases reads after scope disposal (initially stopped: %s)',
		(initial) => {
			const state = reactive({ stop: initial, value: 0 });
			const value = computed(() => state.value);
			const scope = createEffectScope();
			try {
				withEffectScope(scope, () =>
					watch(() => {
						if (state.stop) scope.stop();
						// A callback can continue after disposing its scope. These reads must not
						// leave a stopped observer attached to an independently owned source.
						value.get();
					})
				);
				state.stop = true;
				flushSync();
				expect(inspectComputed(value)).toMatchObject({ observed: false, sinks: 0 });
			} finally {
				scope.stop();
			}
		}
	);
	it('does not notify a reaction for an old dependency it writes without reading again', () => {
		const state = reactive({ selected: true, value: 0 });
		let runs = 0;
		const stop = watch(() => {
			runs++;
			if (state.selected) void state.value;
			else state.value = 1;
		});
		try {
			state.selected = false;
			flushSync();
			expect(runs).toBe(2);
			state.value = 2;
			flushSync();
			expect(runs).toBe(2);
			state.selected = true;
			flushSync();
			state.value = 3;
			flushSync();
			expect(runs).toBe(4);
		} finally {
			stop();
		}
	});
	it('keeps a dependency read before a write eligible for another scheduled pass', () => {
		const state = reactive({ value: 0 });
		let runs = 0;
		const stop = watch(() => {
			runs++;
			if (state.value < 2) state.value++;
		});
		try {
			flushSync();
			expect(state.value).toBe(2);
			expect(runs).toBe(3);
		} finally {
			stop();
		}
	});
});

it('deduplicates reads while growing and shrinking a reaction dependency set', () => {
	const state = reactive({ expanded: false, first: 1, second: 2 });
	let runs = 0;
	let total = 0;
	const stop = watch(() => {
		runs++;
		total = state.expanded ? state.first + state.first + state.second : 0;
	});
	try {
		state.expanded = true;
		flushSync();
		expect(total).toBe(4);
		state.first = 3;
		flushSync();
		expect(total).toBe(8);
		expect(runs).toBe(3);
		state.expanded = false;
		flushSync();
		state.first = 4;
		state.second = 5;
		flushSync();
		expect(runs).toBe(4);
		state.expanded = true;
		flushSync();
		expect(total).toBe(13);
		expect(runs).toBe(5);
	} finally {
		stop();
	}
	state.first = 8;
	flushSync();
	expect(runs).toBe(5);
});

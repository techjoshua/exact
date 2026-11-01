import { expect, it } from 'vitest';
import { withAbortSignal, withTaskSignal } from './signals.js';
import { withExistingAbortSignal, withExistingTaskSignal } from './cleanup-signals.js';
import { verifyTaskNativeOptions } from '../../../component-composition-corpus/test-support/task-native-options-journey.mjs';
it('preserves native inherited listener and request options through task signal adaptation', () => {
	expect(
		verifyTaskNativeOptions({
			withAbortSignal,
			withTaskSignal,
			withExistingAbortSignal,
			withExistingTaskSignal
		})
	).toBe(true);
});
it('captures enumerable signal getters once before overriding the owned copy', () => {
	for (const adapt of [
		withTaskSignal,
		withAbortSignal,
		withExistingTaskSignal,
		withExistingAbortSignal
	]) {
		const owner = new AbortController();
		let reads = 0;
		const input = {
			get signal() {
				reads++;
				return owner.signal;
			},
			once: true
		};
		const options = adapt(input, owner.signal);
		expect(typeof options === 'object' && options.signal).toBe(owner.signal);
		expect(reads).toBe(1);
	}
});

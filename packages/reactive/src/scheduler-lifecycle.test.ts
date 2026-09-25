import { expect, it, onTestFinished } from 'vitest';
import { createEffectScope, flushSync, reactive, watch, withEffectScope } from './index.js';
import { scheduleWork } from './internal/scheduler.js';

for (const kind of ['reaction', 'computation'] as const) {
	for (const transition of ['pause', 'stop'] as const) {
		it(`${transition}s ${kind} work already selected for the current flush`, () => {
			const scope = createEffectScope();
			onTestFinished(() => scope.stop());
			const state = reactive({ value: 0 });
			const values: number[] = [];
			if (kind === 'reaction') {
				onTestFinished(
					watch(() => {
						if (state.value === 1) scope[transition]();
					})
				);
				withEffectScope(scope, () => watch(() => values.push(state.value)));
				state.value = 1;
			} else {
				scheduleWork(() => scope[transition]());
				scheduleWork(() => values.push(state.value), 'normal', undefined, scope);
				state.value = 1;
			}
			flushSync();
			expect(values).toEqual(kind === 'reaction' ? [0] : []);
			state.value = 2;
			if (transition === 'pause') scope.resume();
			flushSync();
			const initial = kind === 'reaction' ? [0] : [];
			expect(values).toEqual(transition === 'stop' ? initial : [...initial, 2]);
			if (kind === 'reaction' && transition === 'pause') {
				state.value = 3;
				flushSync();
				expect(values).toEqual([0, 2, 3]);
			}
		});
	}
}

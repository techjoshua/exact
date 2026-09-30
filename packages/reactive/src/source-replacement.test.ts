import { compiledReactivePropertyOperand } from './indexed-base.js';
import { expect, it, onTestFinished } from 'vitest';
import { computed } from './computation.js';
import { reactive } from './reactive.js';
import { indexedReactiveObjects } from './framework/indexed-objects.js';
import { createEffectScope, withEffectScope } from './internal/scopes.js';
import { flushSync } from './internal/scheduler.js';
import { watch } from './observation.js';
import { updateReactiveShallow } from './reconciliation.js';

for (const indexed of [false, true]) {
	for (const shape of ['scalar', 'object', 'array']) {
		it(`${indexed ? 'indexed' : 'proxy'}/${shape}: replaces equal-valued live sources before retiring their owner`, () => {
			const first = createEffectScope();
			const next = createEffectScope();
			onTestFinished(() => {
				first.stop();
				next.stop();
			});
			const state = reactive({ left: 1, right: 1 });
			const project = (n: number) => (shape === 'scalar' ? n : shape === 'object' ? { n } : [n]);
			const previous = withEffectScope(first, () => computed(() => project(state.left)));
			const replacement = withEffectScope(next, () => computed(() => project(state.right)));
			const props = indexed
				? indexedReactiveObjects(['value'], {}, { value: previous }, true)
				: reactive({ value: previous });
			let observed: unknown;
			const stop = watch(() => {
				const value = props.value as unknown as number | { n: number } | number[];
				observed = typeof value === 'number' ? value : Array.isArray(value) ? value[0] : value.n;
			});
			onTestFinished(stop);
			updateReactiveShallow(props, { value: replacement });
			flushSync();
			first.stop();
			state.right = 2;
			flushSync();
			expect(observed).toBe(2);
			state.left = 3;
			flushSync();
			expect(observed).toBe(2);
			state.right = 4;
			flushSync();
			expect(observed).toBe(4);
		});
	}
}

it('rebinds an indexed property operand when an equal-valued owner is replaced', () => {
	const first = reactive({ value: 1 });
	const next = reactive({ value: 1 });
	const props = indexedReactiveObjects(
		['value'],
		{},
		{ value: [compiledReactivePropertyOperand, first, 'value'] },
		true
	);
	let observed: unknown;
	const stop = watch(() => {
		observed = props.value;
	});
	onTestFinished(stop);
	updateReactiveShallow(props, { value: [compiledReactivePropertyOperand, next, 'value'] });
	flushSync();
	next.value = 2;
	flushSync();
	expect(observed).toBe(2);
	first.value = 3;
	flushSync();
	expect(observed).toBe(2);
});

for (const indexed of [false, true]) {
	it(`${indexed ? 'indexed' : 'proxy'}: follows an equal-valued replacement reactive object`, () => {
		const state = reactive({ left: { value: 1 }, right: { value: 1 } });
		const props = indexed
			? indexedReactiveObjects(['value'], {}, { value: state.left }, true)
			: reactive({ value: state.left });
		let observed: unknown;
		const stop = watch(() => {
			observed = props.value.value;
		});
		onTestFinished(stop);
		updateReactiveShallow(props, { value: state.right });
		flushSync();
		state.right.value = 2;
		flushSync();
		expect(observed).toBe(2);
		state.left.value = 3;
		flushSync();
		expect(observed).toBe(2);
	});
}

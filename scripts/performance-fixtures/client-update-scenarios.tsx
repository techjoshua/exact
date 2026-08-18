import { render, unmount } from '@exactjs/dom';
import { createCompiledComponentVNode } from '@exactjs/core';
import {
	batch,
	createEffectScope,
	flushSync,
	reactive,
	runWithPriority,
	watch,
	withEffectScope
} from '@exactjs/reactive';
import {
	CommitBurst,
	KeyedList,
	commitInstance,
	listInstance,
	releaseCommitInstance,
	releaseListInstance,
	type Item
} from './client-scenario-components.js';

type ScenarioResult = Readonly<{
	metrics: Readonly<Record<string, number>>;
	units: Readonly<Record<string, 'bytes' | 'count' | 'ms'>>;
}>;

/** Measures every supported keyed-list mutation shape against a fresh mounted population. */
export function keyedListMutations(count: number): ScenarioResult {
	const base = Array.from({ length: count }, (_, index) => ({
		id: String(index),
		label: `Row ${index}`
	}));
	const metrics: Record<string, number> = {};
	const units: Record<string, 'count' | 'ms'> = {};
	const measure = (name: string, mutate: (items: Item[]) => void) => {
		const container = document.createElement('div');
		releaseListInstance();
		// Keep the benchmark on the native ownership path regardless of the bundler's
		// cross-module transform order; compatibility adaptation is measured separately.
		render(createCompiledComponentVNode(KeyedList, { items: [...base] }), container);
		assert(listInstance, 'keyed mutation fixture did not expose its instance');
		const started = performance.now();
		mutate(listInstance.state.items);
		flushSync();
		metrics[`${name}Ms`] = performance.now() - started;
		units[`${name}Ms`] = 'ms';
		unmount(container);
	};
	measure('unchanged', (items) => items.splice(0, items.length, ...items));
	measure('oneChanged', (items) => {
		const middle = Math.floor(items.length / 2);
		items[middle] = { ...items[middle]!, label: 'Changed' };
	});
	measure('sparse', (items) => {
		for (let index = 0; index < items.length; index += 100)
			items[index] = { ...items[index]!, label: `Changed ${index}` };
	});
	measure('rotation', (items) => items.unshift(items.pop()!));
	measure('append', (items) => items.push({ id: 'append', label: 'Append' }));
	measure('prepend', (items) => items.unshift({ id: 'prepend', label: 'Prepend' }));
	measure('truncate', (items) => items.splice(Math.floor(items.length / 2)));
	measure('splice', (items) =>
		items.splice(Math.floor(items.length / 2), 10, { id: 'splice', label: 'Splice' })
	);
	measure('replacement', (items) =>
		items.splice(
			0,
			items.length,
			...base.map((item) => ({ ...item, label: `${item.label} replacement` }))
		)
	);
	metrics.operations = count;
	units.operations = 'count';
	return { metrics, units };
}

/** Measures mixed priorities, promotion, deduplication, paused work, resumption, and disposal. */
export function schedulerWorkloads(count: number): ScenarioResult {
	const state = reactive({ values: Array.from({ length: count }, () => 0) });
	const scope = createEffectScope();
	let checksum = 0;
	withEffectScope(scope, () => {
		for (let index = 0; index < count; index++)
			watch(() => {
				checksum += state.values[index]!;
			});
	});
	const started = performance.now();
	runWithPriority('deferred', () => {
		for (let index = 0; index < count; index += 3) state.values[index]++;
	});
	runWithPriority('normal', () => {
		for (let index = 1; index < count; index += 3) state.values[index]++;
	});
	runWithPriority('interactive', () => {
		for (let index = 2; index < count; index += 3) state.values[index]++;
		for (let index = 0; index < count; index += 10) state.values[index]++;
	});
	flushSync();
	const burstMs = performance.now() - started;
	scope.pause();
	for (let index = 0; index < count; index += 5) state.values[index]++;
	flushSync();
	const pausedChecksum = checksum;
	scope.resume();
	flushSync();
	assert(checksum !== pausedChecksum, 'paused scheduler work did not resume');
	scope.stop();
	return {
		metrics: { burstMs, reactions: count, checksum },
		units: { burstMs: 'ms', reactions: 'count', checksum: 'count' }
	};
}

/** Measures one compiler-batched DOM publication while protecting focused selection state. */
export function domCommitBurst(): ScenarioResult {
	const container = document.createElement('div');
	document.body.append(container);
	releaseCommitInstance();
	// See keyedListMutations: this fixture measures native DOM publication, not interop selection.
	render(createCompiledComponentVNode(CommitBurst, {}), container);
	assert(commitInstance, 'DOM commit fixture did not expose its instance');
	const input = container.querySelector('input');
	assert(input, 'DOM commit fixture did not mount its input');
	input.focus();
	input.setSelectionRange(2, 2);
	const started = performance.now();
	batch(() => {
		commitInstance!.state.value = 'first';
		commitInstance!.state.value = 'second';
		commitInstance!.state.title = 'published';
		commitInstance!.state.selected = true;
	});
	flushSync();
	const commitMs = performance.now() - started;
	assert(document.activeElement === input, 'DOM commit lost focus');
	assert(input.selectionStart === 2, 'DOM commit lost selection');
	assert(input.value === 'second' && input.title === 'published', 'DOM commit lost writes');
	unmount(container);
	container.remove();
	return {
		metrics: { commitMs, operations: 4 },
		units: { commitMs: 'ms', operations: 'count' }
	};
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

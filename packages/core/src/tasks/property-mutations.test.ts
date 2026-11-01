import { expect, it, onTestFinished } from 'vitest';
import {
	deleteReactiveValue,
	writeReactiveLazy,
	mutateReactiveArray
} from '../runtime/reactivity.js';
import { taskMutation } from './frame-runtime.js';
import {
	publishTaskMutations,
	stageTaskMutation,
	discardTaskMutations
} from './task-publication.js';
import { captureTaskPropertyMutations, takeTaskPropertyMutations } from './property-mutations.js';

function capture(signal: AbortSignal): void {
	captureTaskPropertyMutations(signal);
	onTestFinished(() => discardTaskMutations(signal));
}

it('records executed no-op deletes and canonical numeric keys without recording unfenced work', () => {
	const signal = new AbortController().signal;
	const root = { rows: ['one', 'two'] };
	capture(signal);
	deleteReactiveValue(root, ['outside']);
	taskMutation(signal, () => deleteReactiveValue(root, ['missing']));
	taskMutation(signal, () => deleteReactiveValue(root, ['rows', 1]));
	const deleted = takeTaskPropertyMutations(signal)!;
	expect(deleted(root, 'missing')).toBe('delete');
	expect(deleted(root.rows, '1')).toBe('delete');
	expect(deleted(root.rows, 1)).toBe('delete');
	expect(deleted(root, 'outside')).toBeUndefined();
	expect(takeTaskPropertyMutations(signal)).toBeUndefined();
});

it('keeps nested independent generation ownership and restores the parent after an exception', () => {
	const outer = new AbortController().signal;
	const inner = new AbortController().signal;
	const plain = new AbortController().signal;
	const root = {};
	capture(outer);
	capture(inner);
	taskMutation(outer, () => {
		taskMutation(plain, () => deleteReactiveValue(root, ['plain']));
		expect(() =>
			taskMutation(inner, () => {
				deleteReactiveValue(root, ['inner']);
				throw new Error('inner');
			})
		).toThrow('inner');
		deleteReactiveValue(root, ['outer']);
	});
	const outerDeletes = takeTaskPropertyMutations(outer)!;
	const innerDeletes = takeTaskPropertyMutations(inner)!;
	expect(outerDeletes(root, 'outer')).toBe('delete');
	expect(outerDeletes(root, 'inner')).toBeUndefined();
	expect(outerDeletes(root, 'plain')).toBeUndefined();
	expect(innerDeletes(root, 'inner')).toBe('delete');
	expect(innerDeletes(root, 'outer')).toBeUndefined();
});

it('records staged publication and releases evidence after cancellation or rejection', () => {
	for (const settle of ['publish', 'discard', 'abort'] as const) {
		const controller = new AbortController();
		const root = { value: 'before' };
		capture(controller.signal);
		stageTaskMutation(controller.signal, () => deleteReactiveValue(root, ['value']));
		if (settle === 'publish') publishTaskMutations(controller.signal);
		else if (settle === 'discard') discardTaskMutations(controller.signal);
		else controller.abort('cancelled');
		const deleted = takeTaskPropertyMutations(controller.signal);
		expect(deleted?.(root, 'value') === 'delete').toBe(settle === 'publish');
		expect(Object.hasOwn(root, 'value')).toBe(settle !== 'publish');
	}
});

it('shares capture with owned child frames while excluding detached work and another capture root', async () => {
	const { runTaskFrame } = await import('../framework/task-frames.js');
	const root = {};
	await runTaskFrame(
		{ kind: 'deletion-parent' },
		{
			work: async (parent) => {
				capture(parent.signal);
				try {
					await runTaskFrame(
						{ kind: 'deletion-child' },
						{
							work: (child) =>
								taskMutation(child.signal, () => deleteReactiveValue(root, ['child']))
						}
					);
					await runTaskFrame(
						{ kind: 'deletion-detached', detached: true },
						{
							work: (child) =>
								taskMutation(child.signal, () => deleteReactiveValue(root, ['detached']))
						}
					);
					await runTaskFrame(
						{ kind: 'deletion-private' },
						{
							work: (child) => {
								capture(child.signal);
								try {
									taskMutation(child.signal, () => deleteReactiveValue(root, ['private']));
									expect(takeTaskPropertyMutations(child.signal)!(root, 'private')).toBe('delete');
								} finally {
									discardTaskMutations(child.signal);
								}
							}
						}
					);
					const deleted = takeTaskPropertyMutations(parent.signal)!;
					expect(deleted(root, 'child')).toBe('delete');
					expect(deleted(root, 'detached')).toBeUndefined();
					expect(deleted(root, 'private')).toBeUndefined();
				} finally {
					discardTaskMutations(parent.signal);
				}
			}
		}
	);
});

it('records equal assignments without inventing array replacement, preserves the last performed operation, and excludes failed writes', () => {
	const controller = new AbortController();
	const root = { value: 'before', rows: ['one'] };
	capture(controller.signal);
	try {
		taskMutation(controller.signal, () => {
			deleteReactiveValue(root, ['value']);
			writeReactiveLazy(root, ['value'], () => 'before');
			mutateReactiveArray(root, ['rows'], 'push', ['two']);
			const locked = Object.freeze({ value: 'fixed' });
			expect(() => writeReactiveLazy(locked, ['value'], () => 'fixed')).toThrow(TypeError);
		});
		const mutations = takeTaskPropertyMutations(controller.signal)!;
		expect(mutations(root, 'value')).toBe('set');
		expect(mutations(root, 'rows')).toBeUndefined();
		expect(root.rows).toEqual(['one', 'two']);
		deleteReactiveValue(root, ['value']);
		expect(mutations(root, 'value')).toBe('set');
	} finally {
		discardTaskMutations(controller.signal);
	}
});

it('keeps ordinary native result and thrown identity without response operation evidence', () => {
	const owner = new AbortController(),
		selected = [0],
		marker = Symbol('authored throw');
	capture(owner.signal);
	expect(taskMutation(owner.signal, () => selected.push(2))).toBe(2);
	let caught: unknown;
	try {
		taskMutation(owner.signal, () => {
			selected[2] = 3;
			throw marker;
		});
	} catch (error) {
		caught = error;
	}
	expect(caught).toBe(marker);
	expect(selected).toEqual([0, 2, 3]);
	expect(takeTaskPropertyMutations(owner.signal)).toBeUndefined();
});

it('retains absent scalar deletion keys for completion projection without new collection tracking', () => {
	const signal = new AbortController().signal,
		rows: unknown[] = [];
	capture(signal);
	taskMutation(signal, () => deleteReactiveValue(rows, ['3']));
	const query = takeTaskPropertyMutations(signal)!;
	expect(query.fields(rows)?.get('3')).toBe('delete');
	expect(query.fields({})).toBeUndefined();
});

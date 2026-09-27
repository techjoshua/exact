import { it, expect } from 'vitest';
import { reactive } from '@exactjs/reactive';
import { defineTask } from './runtime.js';
import type { TaskContext } from './contracts.js';
it('rolls back two failed independent tasks without resurrecting either optimistic value', async () => {
	const state = reactive({ value: 'base' });
	let failA!: (e: Error) => void, failB!: (e: Error) => void;
	const first = new Promise<void>((_, reject) => (failA = reject)),
		second = new Promise<void>((_, reject) => (failB = reject));
	const a = defineTask({ concurrency: 'latest' }, async (task: TaskContext) => {
		task.optimistic(() => (state.value = 'a'));
		await first;
	});
	const b = defineTask({ concurrency: 'latest' }, async (task: TaskContext) => {
		task.optimistic(() => (state.value = 'b'));
		await second;
	});
	const pa = Promise.resolve(a()).catch(() => {});
	await Promise.resolve();
	const pb = Promise.resolve(b()).catch(() => {});
	await Promise.resolve();
	expect(state.value).toBe('b');
	failA(Error('a'));
	await pa;
	expect(state.value).toBe('b');
	failB(Error('b'));
	await pb;
	expect(state.value).toBe('base');
});

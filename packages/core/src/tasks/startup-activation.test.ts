import { expect, it, onTestFinished } from 'vitest';
import type { TaskContext } from './contracts.js';
import { activateTaskOnceForHost } from './activation.js';
import {
	compilerContinuationDependency,
	createContinuationDependencySlot
} from './dependency-source.js';
import { createTaskOwnerRecord } from './frame-runtime.js';
import { registerTaskOwnerHost } from './owner-hosts.js';
import { deferTaskOwnerActivations, releaseTaskOwnerActivations } from './owner-activations.js';
import { defineTask } from './runtime.js';

it('waits for producers once and retains the running generation after input changes', async () => {
	const owner = createTaskOwnerRecord('startup');
	onTestFinished(() => owner[Symbol.asyncDispose]());
	const host = {};
	registerTaskOwnerHost(host, owner);
	const input = createContinuationDependencySlot<number>();
	const generation = input.beginGeneration();
	const values: number[] = [];
	let signal: AbortSignal | undefined;
	let finish!: () => void;
	const work = defineTask({}, async (value: number, task: TaskContext) => {
		signal = task.signal;
		values.push(value);
		await new Promise<void>((resolve) => {
			finish = resolve;
		});
	});
	const activation = activateTaskOnceForHost(host, work, compilerContinuationDependency(input));
	try {
		expect(values).toEqual([]);
		input.publish(generation, 5);
		await Promise.resolve();
		expect(values).toEqual([5]);
		input.beginGeneration();
		expect(signal?.aborted).toBe(false);
		input.publish(generation + 1, 8);
		await Promise.resolve();
		expect(values).toEqual([5]);
		finish();
		await Promise.resolve();
	} finally {
		finish?.();
		activation[Symbol.dispose]();
	}
});

it('suppresses startup after restoration and releases a pending activation on disposal', async () => {
	for (const restored of [false, true]) {
		const owner = createTaskOwnerRecord('startup-resumption');
		onTestFinished(() => owner[Symbol.asyncDispose]());
		const host = {};
		registerTaskOwnerHost(host, owner);
		deferTaskOwnerActivations(owner);
		const input = createContinuationDependencySlot<number>();
		const generation = input.beginGeneration();
		const values: number[] = [];
		const work = defineTask({}, (value: number, _task: TaskContext) => {
			values.push(value);
		});
		const activation = activateTaskOnceForHost(host, work, compilerContinuationDependency(input));
		releaseTaskOwnerActivations(owner, () => restored);
		if (!restored) activation[Symbol.dispose]();
		input.publish(generation, 5);
		await Promise.resolve();
		expect(values).toEqual([]);
		const next = input.beginGeneration();
		input.publish(next, 8);
		await Promise.resolve();
		expect(values).toEqual([]);
		activation[Symbol.dispose]();
	}
});

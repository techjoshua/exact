import { createFrameworkFixtureComponentInstance } from '../testing.js';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';

import '../component/task-capability-integration.js';
import '../runtime/contexts.js';
import type { Component } from '../component/contracts.js';
import { LoggerContext } from '../component/contexts.js';
import type { LogEvent, Logger } from '../logging.js';
import type { TaskContext } from './contracts.js';
import {
	activateCompiledClientLatestTaskForHost,
	bindCompiledClientLatestTaskForHost
} from './compiled-latest.js';
import { createTaskOwnerRecord, executeTaskFrame } from './frame-runtime.js';
import { registerTaskOwnerHost } from './owner-hosts.js';
import { deferTaskOwnerActivations, releaseTaskOwnerActivations } from './owner-activations.js';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((accept) => (resolve = accept));
	return { promise, resolve };
}

function fixtureOwner(label: string) {
	const host = {};
	const owner = createTaskOwnerRecord(label);
	registerTaskOwnerHost(host, owner);
	return { host, owner };
}

describe('compiled default client/latest task lane', () => {
	it('cancels a superseded generation while preserving TaskContext and thenable behavior', async () => {
		const { host } = fixtureOwner('latest');
		const gates = [deferred<number>(), deferred<number>()];
		const signals: AbortSignal[] = [];
		let index = 0;
		const task = bindCompiledClientLatestTaskForHost(host, 'load', async (context: TaskContext) => {
			signals.push(context.signal);
			return gates[index++]!.promise;
		});

		const first = task();
		expect(first).not.toBeInstanceOf(Promise);
		flushSync();
		const second = task();
		flushSync();
		expect(signals[0]?.aborted).toBe(true);
		gates[1]!.resolve(2);
		await expect(second).resolves.toBe(2);
		await expect(first).rejects.toMatchObject({ name: 'AbortError', reason: 'superseded' });
	});

	it('attaches an unobserved invocation to the active interaction frame', async () => {
		const { host, owner } = fixtureOwner('structural');
		const gate = deferred<void>();
		const child = bindCompiledClientLatestTaskForHost(
			host,
			'child',
			async (_context: TaskContext) => gate.promise
		);
		const parent = executeTaskFrame({ owner }, () => {
			void child();
			flushSync();
			return 'foreground';
		});
		let settled = false;
		void parent.then(() => (settled = true));
		await Promise.resolve();
		expect(settled).toBe(false);
		gate.resolve();
		await expect(parent).resolves.toBe('foreground');
	});

	it('defers and then reacts setup activation without materializing universal task lanes', async () => {
		const { host, owner } = fixtureOwner('activation');
		deferTaskOwnerActivations(owner);
		const state = reactive({ value: 1 });
		const values: number[] = [];
		const activation = activateCompiledClientLatestTaskForHost(
			host,
			'project',
			(value: number, _context: TaskContext) => {
				values.push(value);
			},
			computed(() => state.value)
		);
		expect(values).toEqual([]);
		releaseTaskOwnerActivations(owner, () => false);
		flushSync();
		await Promise.resolve();
		expect(values).toEqual([1]);
		state.value = 2;
		flushSync();
		await Promise.resolve();
		expect(values).toEqual([1, 2]);
		activation[Symbol.dispose]();
	});

	it('retains component task performance logging when trace is enabled', async () => {
		const events: LogEvent[] = [];
		const logger: Logger = {
			isEnabled: (level) => level === 'trace',
			log: (event) => events.push(event)
		};
		const parent = createFrameworkFixtureComponentInstance(function Parent(this: Component<{}>) {
			this.setContext(LoggerContext, logger);
			return () => null;
		}, {});
		const owner = createFrameworkFixtureComponentInstance(() => () => null, {}, parent);
		const task = bindCompiledClientLatestTaskForHost(
			owner,
			'load',
			(_context: TaskContext) => 'ready'
		);
		const invocation = task();
		flushSync();
		await expect(invocation).resolves.toBe('ready');
		const traces = events
			.filter((event) => event.message.startsWith('performance task'))
			.map((event) => event.data as Record<string, unknown>);
		expect(traces.map((trace) => trace.phase)).toEqual(['started', 'settled']);
		expect(traces[1]!.attributes).toEqual({ outcome: 'success' });
		parent.unmount();
	});
});

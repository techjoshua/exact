import { expect, it, onTestFinished } from 'vitest';
import { flushSync, reactive, watch } from '@exactjs/reactive';
import { createEffectScope, withEffectScope } from '@exactjs/reactive/framework/runtime';
import { createFrameworkFixtureComponentInstance } from '../testing.js';
import { createFrameworkComponentDomain } from '../component/domain.js';
import { createExactRuntimeInspectionOwner } from '../component/inspection.js';
import { taskOwnerForHost } from './owner-hosts.js';
import { taskFrameInspectionAttached } from './frame-inspection-capability.js';
import {
	currentTaskFrameRecord,
	executeTaskFrame,
	materializeDeferredTaskFrame,
	withDeferredTaskFrame
} from './frame-runtime.js';

function fixtureOwner(inspected: boolean) {
	const inspection = createExactRuntimeInspectionOwner({ buildKey: 'test', executionRoot: 'page' });
	const instance = createFrameworkFixtureComponentInstance(
		function Observer() {
			return () => null;
		},
		{},
		undefined,
		undefined,
		createFrameworkComponentDomain({ executionRoot: 'page', inspection })
	);
	if (inspected) inspection.attach('session', { publish() {} });
	onTestFinished(() => instance.unmount());
	return taskOwnerForHost(instance)!;
}

for (const inspected of [false, true]) {
	for (const automatic of [false, true]) {
		it(`keeps live observations after cancellation (inspection=${inspected}, automatic=${automatic})`, async () => {
			const owner = fixtureOwner(inspected);
			const state = reactive({ value: 0 });
			const values: number[] = [];
			const frames: unknown[] = [];
			onTestFinished(
				watch(() => {
					values.push(state.value);
					frames.push(currentTaskFrameRecord());
				})
			);
			const controller = new AbortController();
			const execution = executeTaskFrame({ owner, controller }, () => {
				expect(taskFrameInspectionAttached(currentTaskFrameRecord()!)).toBe(inspected);
				state.value = 1;
				return new Promise<void>(() => {});
			});
			const cancelled = expect(execution).rejects.toMatchObject({
				name: 'AbortError',
				reason: 'superseded'
			});
			controller.abort('superseded');
			// A newer committed write coalesces into the already queued live observer.
			state.value = 2;
			if (!automatic) expect(() => flushSync()).not.toThrow();
			await cancelled;
			expect(values).toEqual([0, 2]);
			expect(frames).toEqual([undefined, undefined]);
			state.value = 3;
			flushSync();
			expect(values).toEqual([0, 2, 3]);
			expect(owner.frames.size).toBe(0);
		});
	}

	it(`continues the remaining observers when cancellation occurs during a flush (inspection=${inspected})`, async () => {
		const owner = fixtureOwner(inspected);
		const state = reactive({ value: 0 });
		const controller = new AbortController();
		const observations: string[] = [];
		onTestFinished(
			watch(() => {
				observations.push(`first:${state.value}`);
				if (state.value === 1) controller.abort('superseded');
			})
		);
		onTestFinished(
			watch(() => {
				observations.push(`second:${state.value}`);
				if (state.value === 1) expect(currentTaskFrameRecord()).toBeUndefined();
			})
		);
		const execution = executeTaskFrame({ owner, controller }, () => {
			state.value = 1;
			return new Promise<void>(() => {});
		});
		const cancelled = expect(execution).rejects.toMatchObject({ reason: 'superseded' });
		expect(() => flushSync()).not.toThrow();
		await cancelled;
		state.value = 2;
		flushSync();
		expect(observations).toEqual([
			'first:0',
			'second:0',
			'first:1',
			'second:1',
			'first:2',
			'second:2'
		]);
		expect(owner.frames.size).toBe(0);
	});

	it(`does not suppress real observer errors or inherit an unrelated flushing frame (inspection=${inspected})`, async () => {
		const owner = fixtureOwner(inspected);
		const state = reactive({ value: 0 });
		const failure = new DOMException('application failure', 'AbortError');
		onTestFinished(
			watch(() => {
				if (state.value === 1) {
					expect(currentTaskFrameRecord()).toBeUndefined();
					expect(materializeDeferredTaskFrame()).toBeUndefined();
					throw failure;
				}
			})
		);
		const controller = new AbortController();
		const execution = executeTaskFrame({ owner, controller }, () => {
			state.value = 1;
			return new Promise<void>(() => {});
		});
		const cancelled = expect(execution).rejects.toMatchObject({ reason: 'superseded' });
		controller.abort('superseded');
		await executeTaskFrame({ owner }, () => {
			const outer = currentTaskFrameRecord();
			withDeferredTaskFrame(
				() => outer!,
				() => {
					expect(() => flushSync()).toThrow(failure);
					expect(materializeDeferredTaskFrame()).toBe(outer);
				}
			);
			expect(currentTaskFrameRecord()).toBe(outer);
		});
		await cancelled;
		state.value = 2;
		expect(() => flushSync()).not.toThrow();
	});

	it(`releases every cancelled lease and respects stopped scopes (inspection=${inspected})`, async () => {
		const owner = fixtureOwner(inspected);
		const state = reactive({ value: 0 });
		const scope = createEffectScope();
		let observations = 0;
		withEffectScope(scope, () => {
			for (let index = 0; index < 3; index++)
				watch(() => {
					void state.value;
					observations++;
				});
		});
		onTestFinished(() => scope.stop());
		const controller = new AbortController();
		const execution = executeTaskFrame({ owner, controller }, () => {
			state.value = 1;
			return new Promise<void>(() => {});
		});
		const cancelled = expect(execution).rejects.toMatchObject({ reason: 'disposed' });
		controller.abort('disposed');
		scope.stop();
		expect(() => flushSync()).not.toThrow();
		await cancelled;
		expect(observations).toBe(3);
		expect(owner.frames.size).toBe(0);
	});
}

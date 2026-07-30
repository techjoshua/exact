import { describe, expect, it } from 'vitest';

import {
	InteractionCancellation,
	createComponentInstance,
	createExactRuntimeInspectionOwner,
	interactionAwait,
	type Component
} from '../index.js';
import { inspectComponentActions } from './action-api.js';
import type { ActionContext, ComponentAction } from './action-contracts.js';

type HarnessState = {
	value: string;
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe('component actions', () => {
	it('publishes reactive status and permits parallel generations to settle', async () => {
		const work = [deferred<string>(), deferred<string>()];
		let save!: ComponentAction<readonly [string], string>;
		function Harness(this: Component<HarnessState>) {
			this.state.value = '';
			let index = 0;
			save = (this as any).action('save', async (_value: string) => work[index++]!.promise);
			return () => null;
		}
		const instance = createComponentInstance(Harness, {});

		const first = save('one');
		const second = save('two');
		expect(save.pending).toBe(true);
		expect(save.pendingCount).toBe(2);
		expect(save.generation).toBe(2);

		work[1]!.resolve('two');
		await expect(second).resolves.toBe('two');
		expect(save.result).toBe('two');
		expect(save.pendingCount).toBe(1);

		work[0]!.resolve('one');
		await expect(first).resolves.toBe('one');
		expect(save.result).toBe('one');
		expect(save.pending).toBe(false);
		instance.unmount();
	});

	it('rolls back a superseded optimistic generation before publishing the next', async () => {
		const work = [deferred<string>(), deferred<string>()];
		let save!: ComponentAction<readonly [string], string>;
		function Harness(this: Component<HarnessState>) {
			this.state.value = 'base';
			let index = 0;
			save = (this as any).action(
				'save',
				async (value: string, { optimistic }: ActionContext) => {
					optimistic(() => {
						this.state.value = value;
					});
					return work[index++]!.promise;
				},
				'latest'
			);
			return () => null;
		}
		const instance = createComponentInstance(Harness, {});

		const first = save('first');
		expect(instance.state.value).toBe('first');
		const second = save('second');
		expect(instance.state.value).toBe('second');
		await expect(first).rejects.toBeInstanceOf(InteractionCancellation);

		work[1]!.resolve('confirmed');
		await expect(second).resolves.toBe('confirmed');
		expect(instance.state.value).toBe('second');
		expect(save.error).toBeUndefined();
		instance.unmount();
	});

	it('executes queued actions in call order and cancels owned work on disposal', async () => {
		const starts: string[] = [];
		const gates = [deferred<void>(), deferred<void>()];
		let run!: ComponentAction<readonly [string], string>;
		function Harness(this: Component<HarnessState>) {
			this.state.value = '';
			let index = 0;
			run = (this as any).action(
				'queued',
				async (value: string) => {
					starts.push(value);
					await gates[index++]!.promise;
					return value;
				},
				'queue'
			);
			return () => null;
		}
		const instance = createComponentInstance(Harness, {});

		const first = run('first');
		const second = run('second');
		expect(starts).toEqual(['first']);
		gates[0]!.resolve();
		await expect(first).resolves.toBe('first');
		expect(starts).toEqual(['first', 'second']);

		instance.unmount();
		await expect(second).rejects.toBeInstanceOf(InteractionCancellation);
		expect(run.pending).toBe(false);
	});

	it('fences stale continuations after a latest generation is superseded', async () => {
		const gates = [deferred<string>(), deferred<string>()];
		let save!: ComponentAction<readonly [string], void>;
		function Harness(this: Component<HarnessState>) {
			this.state.value = 'base';
			let index = 0;
			save = (this as any).action(
				'latest write',
				async (_value: string, { signal }: ActionContext) => {
					this.state.value = await interactionAwait(signal, gates[index++]!.promise);
				},
				'latest'
			);
			return () => null;
		}
		const instance = createComponentInstance(Harness, {});

		const first = save('first');
		const second = save('second');
		await expect(first).rejects.toBeInstanceOf(InteractionCancellation);
		gates[0]!.resolve('stale');
		await Promise.resolve();
		expect(instance.state.value).toBe('base');

		gates[1]!.resolve('current');
		await second;
		expect(instance.state.value).toBe('current');
		instance.unmount();
	});

	it('exposes durable action status without callbacks or protocol identity', async () => {
		const gate = deferred<string>();
		let save!: ComponentAction<readonly [], string>;
		function Harness(this: Component<HarnessState>) {
			save = (this as any).action.deferred('inspectable save', () => gate.promise, 'queue');
			return () => null;
		}
		const instance = createComponentInstance(Harness, {});
		expect(inspectComponentActions(instance)).toEqual([
			{
				name: 'inspectable save',
				concurrency: 'queue',
				placement: 'inferred',
				priority: 'deferred',
				pending: false,
				pendingCount: 0,
				optimistic: false,
				generation: 0,
				result: undefined,
				error: undefined,
				disposed: false
			}
		]);

		const pending = save();
		expect(inspectComponentActions(instance)[0]).toMatchObject({
			pending: true,
			pendingCount: 1,
			generation: 1
		});
		gate.resolve('saved');
		await pending;
		expect(inspectComponentActions(instance)[0]).toMatchObject({
			pending: false,
			result: 'saved'
		});

		instance.unmount();
		expect(inspectComponentActions(instance)[0]).toMatchObject({
			cancellationReason: 'unmount',
			disposed: true
		});
	});

	it('never publishes caller-provided cancellation values into inspection events', async () => {
		const events: unknown[] = [];
		const inspection = createExactRuntimeInspectionOwner({
			buildKey: 'a'.repeat(40),
			executionRoot: 'page'
		});
		inspection.attach('session', { publish: (event) => events.push(event) });
		let action!: ComponentAction<readonly [], void>;
		function Harness(this: Component<HarnessState>) {
			action = (this as any).action('Cancel safely', () => new Promise<void>(() => {}));
			return () => null;
		}
		createComponentInstance(Harness, {}, undefined, undefined, {
			executionRoot: 'page',
			inspection
		});
		const pending = action();
		action.cancel('must-never-enter-an-event');
		await expect(pending).rejects.toBeInstanceOf(InteractionCancellation);

		expect(JSON.stringify(events)).not.toContain('must-never-enter-an-event');
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'task.cancel', reason: 'cancelled' })
			])
		);
	});

	it('rolls back every optimistic block when action work throws synchronously', async () => {
		let save!: ComponentAction<readonly [], void>;
		function Harness(this: Component<HarnessState>) {
			this.state.value = 'base';
			save = (this as any).action(
				'multiple optimism',
				({ optimistic }: ActionContext) => {
					optimistic(() => {
						this.state.value = 'first';
					});
					optimistic(() => {
						this.state.value = 'second';
					});
					throw new Error('failed');
				},
				'latest'
			);
			return () => null;
		}
		const instance = createComponentInstance(Harness, {});

		await expect(save()).rejects.toThrow('failed');
		expect(instance.state.value).toBe('base');
		expect(save.pending).toBe(false);
		expect(save.error).toEqual(new Error('failed'));
		instance.unmount();
	});
});

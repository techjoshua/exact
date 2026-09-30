/** @vitest-environment jsdom */
import { it, expect, vi } from 'vitest';
import {
	Activity,
	bindTask,
	defineTask,
	taskAwait,
	stageTaskMutation,
	type Component,
	type ActivityMode,
	type TaskContext
} from '@exactjs/core';
import { createExpression } from '@exactjs/core/runtime/render';
import { createTestOperation as jsx } from '@exactjs/testing/internal/fixtures';
import { render, unmount } from '@exactjs/dom';
import './structural-boundaries.js';
import { flushSync } from '@exactjs/reactive';
import { taskOwnerForHost } from '../../core/src/tasks/owner-hosts.js';
import { createTaskProgressReceiver } from '../../core/src/tasks/progress-receiver.js';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
for (const ending of ['success', 'failure', 'cancel', 'dispose'] as const)
	for (const repark of [false, true])
		it(`parked optimistic task ${ending} repark ${repark}`, async () => {
			let boundary!: Component<{ mode: ActivityMode }>, panel!: Component<{ value: string }>;
			let run!: ReturnType<typeof bindTask<[], void>>, release!: () => void;
			const gate = new Promise<void>((resolve) => (release = resolve));
			let entered = 0,
				cleaned = 0;
			function Panel(this: Component<{ value: string }>) {
				panel = this;
				this.state.value = 'base';
				run = bindTask(
					defineTask({ concurrency: 'latest' }, async (context: TaskContext) => {
						entered++;
						context.cleanup(() => {
							cleaned++;
						});
						context.optimistic(() => {
							this.state.value = 'pending';
						});
						await taskAwait(context.signal, gate);
						if (ending === 'failure') throw Error('expected');
						stageTaskMutation(context.signal, () => {
							this.state.value = 'done';
						});
					}),
					{ owner: taskOwnerForHost(this)! }
				);
				return () =>
					jsx(
						'p',
						{},
						createExpression(() => this.state.value)
					);
			}
			function App(this: Component<{ mode: ActivityMode }>) {
				boundary = this;
				this.state.mode = 'active';
				return () =>
					jsx(Activity, { mode: createExpression(() => this.state.mode) }, jsx(Panel, {}));
			}
			const root = document.createElement('div');
			render(jsx(App, {}), root);
			try {
				const element = root.querySelector('p');
				const result = Promise.resolve(run()).then(
					() => 'ok',
					(error) => (error.name === 'AbortError' ? 'cancel' : error.message)
				);
				await vi.waitFor(() => expect(entered).toBe(1));
				boundary.state.mode = 'parked';
				flushSync();
				release();
				await tick();
				expect(panel.state.value).toBe('pending');
				expect(root.querySelector('p')).toBeNull();
				if (repark) {
					boundary.state.mode = 'active';
					flushSync();
					boundary.state.mode = 'parked';
					flushSync();
					await tick();
					expect(panel.state.value).toBe('pending');
				}
				if (ending === 'cancel') run.cancel();
				if (ending === 'dispose') unmount(root);
				if (ending === 'success' || ending === 'failure') {
					boundary.state.mode = 'active';
					flushSync();
				}
				expect(await result).toBe(
					ending === 'success' ? 'ok' : ending === 'failure' ? 'expected' : 'cancel'
				);
				expect(panel.state.value).toBe(ending === 'success' ? 'done' : 'base');
				expect(cleaned).toBe(1);
				expect(run.pendingCount).toBe(0);
				if (ending !== 'dispose') {
					boundary.state.mode = 'active';
					flushSync();
					await tick();
					flushSync();
					expect(root.querySelector('p')).toBe(element);
					expect(element?.textContent).toBe(panel.state.value);
				}
			} finally {
				release();
				unmount(root);
			}
		});
for (const priority of ['immediate', 'normal', 'deferred'] as const)
	for (const ending of ['resume', 'close', 'dispose'] as const)
		it(`parked progress ${priority} ${ending}`, async () => {
			let boundary!: Component<{ mode: ActivityMode }>,
				receiver!: ReturnType<typeof createTaskProgressReceiver<number>>;
			const published: number[] = [],
				errors: unknown[] = [];
			let entered = 0,
				cleaned = 0,
				release!: () => void;
			const gate = new Promise<void>((resolve) => (release = resolve));
			function Panel(this: Component<{}>) {
				receiver = createTaskProgressReceiver({
					owner: taskOwnerForHost(this)!,
					signal: new AbortController().signal,
					label: 'probe',
					priority,
					onError: (error) => errors.push(error),
					async receive(value: number, task) {
						entered++;
						task.cleanup(() => {
							cleaned++;
						});
						await taskAwait(task.signal, gate);
						stageTaskMutation(task.signal, () => published.push(value));
					}
				});
				this.onUnmount(() => receiver.close());
				return () => jsx('p', {}, 'panel');
			}
			function App(this: Component<{ mode: ActivityMode }>) {
				boundary = this;
				this.state.mode = 'active';
				return () =>
					jsx(Activity, { mode: createExpression(() => this.state.mode) }, jsx(Panel, {}));
			}
			const root = document.createElement('div');
			render(jsx(App, {}), root);
			try {
				receiver.report(1);
				await vi.waitFor(() => expect(entered).toBe(1));
				boundary.state.mode = 'parked';
				flushSync();
				receiver.report(2);
				receiver.report(3);
				release();
				await tick();
				expect(published).toEqual([]);
				if (ending === 'dispose') unmount(root);
				else if (ending === 'close') receiver.close();
				else {
					boundary.state.mode = 'active';
					flushSync();
					await vi.waitFor(() => expect(published).toEqual([1, 3]));
					receiver.report(4);
					await vi.waitFor(() => expect(published).toEqual([1, 3, 4]));
				}
				if (ending !== 'resume') {
					boundary.state.mode = 'active';
					flushSync();
					await tick();
					expect(published).toEqual([]);
				}
				receiver.close();
				await tick();
				expect(cleaned).toBe(entered);
				expect(errors).toEqual([]);
			} finally {
				release();
				receiver.close();
				unmount(root);
			}
		});

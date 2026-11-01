import { runTaskFrame } from '@exactjs/core/framework/task-frames';
import { createFrameworkFixtureComponentInstance } from '@exactjs/core/testing';
import '@exactjs/core/runtime/lifecycle';
import {
	currentEffectScope,
	registerEffectScopeCleanup
} from '@exactjs/reactive/framework/runtime';
import { createContext } from '@exactjs/core';
import { createExactContextRuntime, runWithExactRequestScope } from '@exactjs/server';

/** Checks cleanup failure values survive component, task, scope and stream boundaries. */
export async function cleanupValuesJourney() {
	const results = [];
	for (const primary of [undefined, null, new Error('first failure')]) {
		const order = [];
		const task = await runTaskFrame(
			{ kind: 'cleanup-values' },
			{
				work(context) {
					context.cleanup(() => {
						order.push('later');
						throw new Error('later failure');
					});
					context.cleanup(() => {
						order.push('first');
						throw primary;
					});
				}
			}
		).then(
			() => ({ failed: false }),
			(error) => ({ failed: true, error })
		);
		results.push(task.failed && task.error === primary && order.join(',') === 'first,later');
		const calls = [];
		const instance = createFrameworkFixtureComponentInstance(function Owner() {
			registerEffectScopeCleanup(currentEffectScope(), () => {
				calls.push('scope');
				throw primary;
			});
			this.onUnmount(() => {
				calls.push('lifecycle');
			});
			return () => null;
		}, {});
		let failed = false,
			failure;
		try {
			instance.unmount();
		} catch (error) {
			failed = true;
			failure = error;
		}
		instance.unmount();
		results.push(failed && failure === primary && calls.join(',') === 'scope,lifecycle');
	}
	for (const scope of ['application', 'request']) {
		const token = createContext('cleanup-values.' + scope, { scope });
		let calls = 0;
		const runtime = createExactContextRuntime({
			[scope + 'Contexts']: [
				[
					token,
					{
						create: () => ({}),
						dispose() {
							calls++;
							throw undefined;
						}
					}
				]
			]
		});
		await runtime.open({ method: 'GET', url: 'http://exact.test/' });
		const outcome = await runtime.dispose().then(
			() => ({ failed: false }),
			(error) => ({ failed: true, error })
		);
		await runtime.dispose();
		results.push(outcome.failed && outcome.error === undefined && calls === 1);
	}
	results.push(await cancelStream());
	return results;
}

async function cancelStream() {
	const token = createContext('cleanup-values.stream', { scope: 'request' });
	let disposed = 0;
	const runtime = createExactContextRuntime({
		requestContexts: [
			[
				token,
				{
					create: () => ({}),
					dispose() {
						disposed++;
						throw new Error('cleanup failed');
					}
				}
			]
		]
	});
	const upstream = new ReadableStream({
		cancel() {
			return Promise.reject(undefined);
		}
	});
	try {
		const response = await runWithExactRequestScope(
			{ method: 'GET', url: 'http://exact.test/' },
			{
				contract: { version: 1, invocations: {}, boundaries: {} },
				contextRuntime: runtime
			},
			() => ({ status: 200, headers: {}, stream: upstream })
		);
		const result = await response.stream.cancel('caller').then(
			() => ({ failed: false }),
			(error) => ({ failed: true, error })
		);
		return result.failed && result.error === undefined && disposed === 1 && !upstream.locked;
	} finally {
		await runtime.dispose();
	}
}

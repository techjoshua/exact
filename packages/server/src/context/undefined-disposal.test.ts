import { createContext } from '@exactjs/core';
import { expect, it } from 'vitest';
import { createExactContextRuntime } from './request.js';

it.each(['application', 'request'] as const)(
	'reports %s disposal throwing undefined',
	async (scope) => {
		const token = createContext<object>(`undefined-disposal.${scope}`, { scope });
		let disposed = 0;
		const runtime = createExactContextRuntime({
			[scope === 'application' ? 'applicationContexts' : 'requestContexts']: [
				[
					token,
					{
						create: () => ({}),
						dispose() {
							disposed++;
							throw undefined;
						}
					}
				]
			]
		});
		await runtime.open({ method: 'GET', url: 'http://exact.test/' });
		const outcome = await runtime.dispose().then(
			() => ({ rejected: false, error: undefined }),
			(error: unknown) => ({ rejected: true, error })
		);
		expect(disposed).toBe(1);
		expect(outcome).toEqual({ rejected: true, error: undefined });
		await expect(runtime.dispose()).resolves.toBeUndefined();
	}
);

it('retains undefined stream cancellation failure while completing scope cleanup', async () => {
	const { retainScopeForStream } = await import('./response.js');
	let disposed = 0;
	const upstream = new ReadableStream<Uint8Array>({
		cancel() {
			return Promise.reject(undefined);
		}
	});
	const stream = retainScopeForStream(upstream, async () => {
		disposed++;
		throw new Error('cleanup failed');
	});
	const outcome = await stream.cancel('caller').then(
		() => ({ rejected: false, error: undefined }),
		(error: unknown) => ({ rejected: true, error })
	);
	expect(disposed).toBe(1);
	expect(outcome).toEqual({ rejected: true, error: undefined });
	expect(upstream.locked).toBe(false);
});

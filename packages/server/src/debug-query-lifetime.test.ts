import { it, vi } from 'vitest';
import * as server from './index.js';
import { verifyDebugQueryLifetime } from '../../component-composition-corpus/test-support/debug-query-lifetime-journey.js';

it.each(['session', 'runtime', 'abort', 'pre-abort'] as const)(
	'fences query publication after %s retirement and permits the next owner',
	async (retirement) => {
		await verifyDebugQueryLifetime(server, retirement);
	}
);

it('fences query publication after expiry without requiring another request to prune sessions', async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	try {
		await verifyDebugQueryLifetime(server, 'expiry', () =>
			vi.setSystemTime(Date.now() + 31 * 60_000)
		);
	} finally {
		vi.useRealTimers();
	}
});

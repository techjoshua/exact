import { it, vi } from 'vitest';
import * as server from './index.js';
import { verifyDebugAuditLifetime } from '../../component-composition-corpus/test-support/debug-audit-journey.js';

it.each([
	'session',
	'runtime',
	'abort',
	'throw',
	'async',
	'pending',
	'resolved',
	'value',
	'thenable',
	'throwing-then'
] as const)(
	'preserves query lifetime and failure isolation across %s audit callbacks',
	async (mode) => {
		await verifyDebugAuditLifetime(server, mode);
	}
);

it('rechecks expiry after an application audit callback runs', async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	try {
		await verifyDebugAuditLifetime(server, 'expiry', () =>
			vi.setSystemTime(Date.now() + 31 * 60_000)
		);
	} finally {
		vi.useRealTimers();
	}
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExactServerContext } from '../types.js';
import { createExactServerDebugRuntime } from './runtime.js';
import { createExactDebugSessionManager } from './sessions.js';

const request = { method: 'POST', url: '/__exact' };
const limits = { maxSessions: 1, maxSessionMinutes: 1 };

function context(overrides: Partial<ExactServerContext> = {}): ExactServerContext {
	return {
		contract: { version: 1, endpoint: '/__exact', invocations: {}, executors: {}, boundaries: {} },
		allowDebug: true,
		...overrides
	};
}

afterEach(() => vi.useRealTimers());

describe('debug session asynchronous ownership', () => {
	it('enforces capacity after concurrent authorization settles', async () => {
		const manager = createExactDebugSessionManager(
			context({ allowDebug: async () => true }),
			limits
		);
		const opened = await Promise.all(
			Array.from({ length: 20 }, () => manager.open(request, ['snapshot']))
		);
		expect(opened.filter(Boolean)).toHaveLength(1);
		expect(manager.active()).toHaveLength(1);
		manager.closeAll();
	});

	it.each(['revoked', 'expired', 'closed'] as const)(
		'does not renew a %s session after authorization',
		async (cause) => {
			vi.useFakeTimers();
			const policy = context();
			const manager = createExactDebugSessionManager(policy, limits);
			const session = (await manager.open(request, ['snapshot']))!;
			const authorization = deferred<boolean>();
			policy.allowDebug = () => authorization.promise;
			const pending = manager.require(request, session.id, 'source');
			if (cause === 'revoked') manager.close(session.id);
			else if (cause === 'closed') manager.closeAll();
			else vi.advanceTimersByTime(60_001);
			authorization.resolve(true);
			expect(await pending).toBeUndefined();
			expect(session.capabilities.has('source')).toBe(false);
			expect(manager.active()).toHaveLength(0);
		}
	);

	it('does not publish a pending open after runtime shutdown', async () => {
		const authorization = deferred<boolean>();
		const runtime = createExactServerDebugRuntime(
			context({ allowDebug: () => authorization.promise })
		);
		const pending = runtime.handle(request, {
			type: 'debug',
			version: 1,
			request: 'open',
			capabilities: ['snapshot']
		});
		await runtime.close();
		authorization.resolve(true);
		expect((await pending).status).toBe(404);
	});

	it('rechecks revocation after asynchronous identity verification', async () => {
		const policy = context({ debugSessionIdentity: () => 'operator' });
		const manager = createExactDebugSessionManager(policy, limits);
		const session = (await manager.open(request, ['snapshot']))!;
		const identity = deferred<string>();
		const entered = deferred<void>();
		policy.debugSessionIdentity = () => {
			entered.resolve();
			return identity.promise;
		};
		const pending = manager.require(request, session.id, 'source');
		await entered.promise;
		manager.close(session.id);
		identity.resolve('operator');
		expect(await pending).toBeUndefined();
		expect(manager.active()).toHaveLength(0);
	});
});

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
}

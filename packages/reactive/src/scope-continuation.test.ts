import { describe, expect, it, vi } from 'vitest';
import { createEffectScope, scheduleEffectScopeResume } from './internal/scopes.js';

describe('scheduled scope continuations', () => {
	it.each(['resume', 'stop'] as const)(
		'queues one continuation after scope %s',
		async (operation) => {
			const scope = createEffectScope();
			const continuation = vi.fn();
			scope.pause();
			const dispose = scheduleEffectScopeResume(scope, continuation);
			try {
				scope[operation]();
				expect(continuation).not.toHaveBeenCalled();
				await Promise.resolve();
				expect(continuation).toHaveBeenCalledOnce();
				scope.resume();
				await Promise.resolve();
				expect(continuation).toHaveBeenCalledOnce();
			} finally {
				dispose();
				scope.stop();
			}
		}
	);
	it.each([false, true])(
		'cancels a continuation with resume already queued: %s',
		async (queued) => {
			const scope = createEffectScope();
			const continuation = vi.fn();
			scope.pause();
			const dispose = scheduleEffectScopeResume(scope, continuation);
			try {
				if (queued) scope.resume();
				dispose();
				dispose();
				expect(Reflect.get(scope, 'resumeWaiters').size).toBe(0);
				scope.resume();
				await Promise.resolve();
				expect(continuation).not.toHaveBeenCalled();
			} finally {
				dispose();
				scope.stop();
			}
		}
	);
});

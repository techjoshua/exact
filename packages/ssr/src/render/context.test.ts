import { describe, expect, it } from 'vitest';
import { awaitWithAbort } from './context.js';
import { SsrTaskDeadlineError } from './limits.js';

describe('interrupted SSR waits', () => {
	it.each(['aborted', 'expired'] as const)(
		'observes later work failure when the wait is already %s',
		async (mode) => {
			let rejectWork!: (error: Error) => void;
			const work = new Promise<void>((_resolve, reject) => {
				rejectWork = reject;
			});
			const controller = new AbortController();
			const reason = new Error('request cancelled');
			if (mode === 'aborted') controller.abort(reason);
			const waiting = awaitWithAbort(work, controller.signal, mode === 'expired' ? 0 : undefined);
			if (mode === 'aborted') await expect(waiting).rejects.toBe(reason);
			else await expect(waiting).rejects.toBeInstanceOf(SsrTaskDeadlineError);
			// Disposal can reject the already-started work after the caller receives interruption.
			rejectWork(new Error('work failed during disposal'));
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		}
	);
});

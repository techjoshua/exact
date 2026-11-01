import { expect, it } from 'vitest';
import { awaitWithAbort } from './context.js';

it('observes later work failure when the request is already aborted', async () => {
	let rejectWork!: (error: Error) => void;
	const work = new Promise<void>((_resolve, reject) => {
		rejectWork = reject;
	});
	const controller = new AbortController();
	const reason = new Error('request cancelled');
	controller.abort(reason);
	await expect(awaitWithAbort(work, controller.signal)).rejects.toBe(reason);
	rejectWork(new Error('work failed during disposal'));
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
});

it.each([true, false])('preserves null cancellation with pre-aborted=%s', async (preAborted) => {
	const controller = new AbortController();
	if (preAborted) controller.abort(null);
	let resolve!: (value: string) => void;
	const work = new Promise<string>((done) => {
		resolve = done;
	});
	const waiting = awaitWithAbort(work, controller.signal);
	if (!preAborted) controller.abort(null);
	await expect(waiting).rejects.toBe(null);
	resolve('late');
});

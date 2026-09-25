import { describe, expect, it } from 'vitest';
import { createEffectScope } from '@exactjs/reactive';
import { taskAwait, trackTaskOwner } from './tasks/resources.js';
import type { AnyComponentInstance } from './component/contracts.js';

describe('paused task cancellation ownership', () => {
	it.each(['fulfill', 'reject'] as const)(
		'lets cancellation win after resumption but before a parked %s continuation runs',
		async (mode) => {
			const scope = createEffectScope();
			const controller = new AbortController();
			trackTaskOwner(controller.signal, { scope } as AnyComponentInstance);
			scope.pause();
			try {
				const source =
					mode === 'fulfill' ? Promise.resolve(1) : Promise.reject(new Error('failed'));
				const waiting = taskAwait(controller.signal, source);
				const rejected = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
				await Promise.resolve();
				scope.resume();
				controller.abort();
				await rejected;
				expect(Reflect.get(scope, 'resumeWaiters').size).toBe(0);
			} finally {
				controller.abort();
				scope.stop();
			}
		}
	);
	it('releases a fulfilled task continuation from a still-paused scope on cancellation', async () => {
		const scope = createEffectScope();
		const controller = new AbortController();
		trackTaskOwner(controller.signal, { scope } as AnyComponentInstance);
		scope.pause();
		try {
			const waiting = taskAwait(controller.signal, Promise.resolve('ready'));
			const rejected = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
			await Promise.resolve();
			expect(Reflect.get(scope, 'resumeWaiters').size).toBe(1);
			controller.abort('cancel');
			await rejected;
			expect(scope.paused).toBe(true);
			expect(Reflect.get(scope, 'resumeWaiters').size).toBe(0);
		} finally {
			scope.stop();
		}
	});

	it('does not park a source that fulfills after its task was cancelled', async () => {
		const scope = createEffectScope();
		const controller = new AbortController();
		trackTaskOwner(controller.signal, { scope } as AnyComponentInstance);
		scope.pause();
		let complete!: (value: string) => void;
		const source = new Promise<string>((resolve) => {
			complete = resolve;
		});
		try {
			const waiting = taskAwait(controller.signal, source);
			const rejected = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
			controller.abort('cancel');
			await rejected;
			complete('late');
			await Promise.resolve();
			expect(Reflect.get(scope, 'resumeWaiters').size).toBe(0);
		} finally {
			scope.stop();
		}
	});

	it('parks authored rejection continuations until the owner resumes', async () => {
		const scope = createEffectScope();
		const controller = new AbortController();
		trackTaskOwner(controller.signal, { scope } as AnyComponentInstance);
		scope.pause();
		const error = new Error('source failed');
		let received: unknown;
		try {
			const waiting = taskAwait(controller.signal, Promise.reject(error)).catch((failure) => {
				received = failure;
			});
			await Promise.resolve();
			await Promise.resolve();
			expect(received).toBeUndefined();
			scope.resume();
			await waiting;
			expect(received).toBe(error);
		} finally {
			controller.abort();
			scope.stop();
		}
	});
});

it.each(['fulfill', 'reject'] as const)(
	'reparks a %s continuation when its scope pauses again before delivery',
	async (mode) => {
		const scope = createEffectScope();
		const controller = new AbortController();
		trackTaskOwner(controller.signal, { scope } as AnyComponentInstance);
		const received: unknown[] = [];
		const source = mode === 'fulfill' ? Promise.resolve('ready') : Promise.reject('failed');
		scope.pause();
		const waiting = taskAwait(controller.signal, source).then(
			(value) => received.push(value),
			(error) => received.push(error)
		);
		try {
			await Promise.resolve();
			scope.resume();
			scope.pause();
			await Promise.resolve();
			await Promise.resolve();
			expect(received).toEqual([]);
			scope.resume();
			await waiting;
			expect(received).toEqual([mode === 'fulfill' ? 'ready' : 'failed']);
		} finally {
			controller.abort();
			scope.stop();
			await waiting;
		}
	}
);

it('observes a rejected source when taskAwait is called with an already aborted signal', async () => {
	const controller = new AbortController();
	controller.abort('superseded');
	await expect(
		taskAwait(controller.signal, Promise.reject(new Error('late source failure')))
	).rejects.toMatchObject({ name: 'AbortError' });
	await new Promise((resolve) => setTimeout(resolve, 0));
});

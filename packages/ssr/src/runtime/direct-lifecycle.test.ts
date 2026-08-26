import { describe, expect, it, vi } from 'vitest';
import { createDirectSsrComponentFrame } from '../render/direct-component-support.js';
import {
	directSsrLifecycle,
	ownDirectSsrResource,
	registerDirectSsrLifecycleHandler,
	registerDirectSsrRenderHandler
} from './direct-lifecycle.js';

describe('direct SSR lifecycle', () => {
	it('isolates render and teardown registrations by request-local frame', async () => {
		const first = createDirectSsrComponentFrame();
		const second = createDirectSsrComponentFrame();
		const events: string[] = [];
		registerDirectSsrRenderHandler(first, ({ duration }) => events.push(`first:${duration}`));
		registerDirectSsrLifecycleHandler(first, 'unmount', ({ reason }) =>
			events.push(`first:${reason}`)
		);
		registerDirectSsrLifecycleHandler(second, 'unmount', ({ reason }) =>
			events.push(`second:${reason}`)
		);

		directSsrLifecycle.rendered(first, 3);
		await directSsrLifecycle.dispose(second, 'second-complete');
		await directSsrLifecycle.dispose(first, 'first-complete');
		await directSsrLifecycle.dispose(first, 'duplicate');

		expect(events).toEqual(['first:3', 'second:second-complete', 'first:first-complete']);
	});

	it('starts every owned cleanup and awaits asynchronous disposal', async () => {
		const frame = createDirectSsrComponentFrame();
		const disposed = vi.fn(async () => Promise.resolve());
		const resource = { [Symbol.asyncDispose]: disposed };
		expect(ownDirectSsrResource(frame, resource)).toBe(resource);

		await directSsrLifecycle.dispose(frame, 'complete');

		expect(disposed).toHaveBeenCalledOnce();
	});

	it('finishes all teardown callbacks before reporting their failures', async () => {
		const frame = createDirectSsrComponentFrame();
		const completed: string[] = [];
		registerDirectSsrLifecycleHandler(frame, 'unmount', () => {
			completed.push('sync');
			throw new Error('sync cleanup');
		});
		registerDirectSsrLifecycleHandler(frame, 'unmount', async () => {
			completed.push('async');
			throw new Error('async cleanup');
		});

		await expect(directSsrLifecycle.dispose(frame, 'failed')).rejects.toThrow(
			'Direct SSR cleanup failed'
		);
		expect(completed).toEqual(['sync', 'async']);
	});
});

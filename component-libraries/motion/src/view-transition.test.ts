import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewTransitionCoordinator } from './view-transition.js';

afterEach(() => vi.unstubAllGlobals());

describe('view transition publication', () => {
	it('publishes immediately and awaits rendered consequences when unsupported', async () => {
		vi.stubGlobal('document', {});
		const publish = vi.fn(() => ({ rendered: Promise.resolve() }));
		await createViewTransitionCoordinator().publish({
			kind: 'navigation',
			signal: new AbortController().signal,
			metadata: {},
			publish
		});
		expect(publish).toHaveBeenCalledTimes(1);
	});

	it('publishes inside the native update callback and leaves visual completion nonblocking', async () => {
		let finish!: () => void;
		const finished = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const skipTransition = vi.fn();
		vi.stubGlobal('document', {
			startViewTransition(update: () => PromiseLike<void> | void) {
				const updateCallbackDone = Promise.resolve().then(update);
				return { updateCallbackDone, finished, skipTransition };
			}
		});
		let rendered!: () => void;
		const renderedGate = new Promise<void>((resolve) => {
			rendered = resolve;
		});
		const publish = vi.fn(() => ({ rendered: renderedGate }));
		let coordinated = false;
		const result = Promise.resolve(
			createViewTransitionCoordinator({ name: () => 'route' }).publish({
				kind: 'navigation',
				signal: new AbortController().signal,
				metadata: {},
				publish
			})
		).then(() => {
			coordinated = true;
		});

		await Promise.resolve();
		expect(publish).toHaveBeenCalledTimes(1);
		expect(coordinated).toBe(false);
		rendered();
		await result;
		expect(coordinated).toBe(true);
		finish();
		await Promise.resolve();
		expect(skipTransition).not.toHaveBeenCalled();
	});

	it('does not publish an already aborted request', async () => {
		const abort = new AbortController();
		abort.abort('stale-navigation');
		const publish = vi.fn(() => ({ rendered: Promise.resolve() }));
		await createViewTransitionCoordinator({ reducedMotion: 'always' }).publish({
			kind: 'navigation',
			signal: abort.signal,
			metadata: {},
			publish
		});
		expect(publish).not.toHaveBeenCalled();
	});
});

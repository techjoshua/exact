import { describe, expect, it, vi } from 'vitest';
import { renderToString, renderToHydratableString } from './render-output.js';

describe('host-controlled render starts', () => {
	for (const render of [renderToString, renderToHydratableString]) {
		it(`${render.name} begins output processing immediately when the host returns void`, async () => {
			const started = vi.fn();
			const pending = render('hello', {
				scheduleRender: () => undefined,
				outputExtensions: [
					{
						transform: (value) => {
							started();
							return value;
						}
					}
				]
			});
			expect(started).toHaveBeenCalledOnce();
			expect((await pending).html).toContain('hello');
		});

		it(`${render.name} waits once before rendering and retains output`, async () => {
			let release!: () => void;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const scheduleRender = vi.fn(() => gate);
			const onProfile = vi.fn();
			const pending = render('hello', { scheduleRender, onProfile });
			expect(scheduleRender).toHaveBeenCalledOnce();
			expect(onProfile).not.toHaveBeenCalled();
			release();
			expect((await pending).html).toBe((await render('hello')).html);
			expect(scheduleRender).toHaveBeenCalledOnce();
		});

		it(`${render.name} does not start after cancellation while queued`, async () => {
			let release!: () => void;
			const controller = new AbortController();
			const reason = new Error('closed');
			const onProfile = vi.fn();
			const pending = render('hello', {
				signal: controller.signal,
				onProfile,
				scheduleRender: () =>
					new Promise<void>((resolve) => {
						release = resolve;
					})
			});
			controller.abort(reason);
			release();
			await expect(pending).rejects.toBe(reason);
			expect(onProfile).not.toHaveBeenCalled();
		});
	}
});

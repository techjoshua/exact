import { expect, it, vi } from 'vitest';
import { executeTaskFrame } from './frame-runtime.js';
import {
	ownReleasableTaskResource,
	releaseTaskResource,
	taskResourceReleaseMethod
} from './resource-release.js';

it.each([false, true])(
	'disposes exactly once with an executed conditional release: %s',
	async (release) => {
		const dispose = vi.fn();
		const resource = { dispose };
		await executeTaskFrame({}, (task) => {
			expect(ownReleasableTaskResource(task, resource, 'dispose')).toBe(resource);
			if (release) releaseTaskResource(task.signal, resource, resource.dispose());
		});
		expect(dispose).toHaveBeenCalledTimes(1);
	}
);

it('retains fallback cleanup if authored registration throws', async () => {
	const dispose = vi.fn();
	const resource = { dispose };
	const failure = new Error('registration failed');
	await expect(
		executeTaskFrame({}, (task) => {
			ownReleasableTaskResource(task, resource, 'dispose');
			releaseTaskResource(
				task.signal,
				resource,
				(() => {
					throw failure;
				})()
			);
		})
	).rejects.toBe(failure);
	expect(dispose).toHaveBeenCalledTimes(1);
});

it('preserves a native release promise and receiver without adding fallback disposal', async () => {
	const result = Promise.resolve();
	const resource = {
		dispose() {
			expect(this).toBe(resource);
			return result;
		}
	};
	const dispose = vi.spyOn(resource, 'dispose');
	await executeTaskFrame({}, (task) => {
		ownReleasableTaskResource(task, resource, 'dispose');
		expect(releaseTaskResource(task.signal, resource, resource.dispose())).toBe(result);
	});
	expect(dispose).toHaveBeenCalledTimes(1);
});

it('transfers fallback ownership only after the context accepts the resource', async () => {
	const dispose = vi.fn();
	const resource = { [Symbol.dispose]: dispose };
	await executeTaskFrame({}, (task) => {
		ownReleasableTaskResource(task, resource);
		expect(releaseTaskResource(task.signal, resource, task.own(resource))).toBe(resource);
	});
	expect(dispose).toHaveBeenCalledTimes(1);
});

it('runs authored cleanup before fallback disposal on cancellation', async () => {
	const owner = new AbortController();
	const dispose = vi.fn();
	const resource = { dispose };
	const result = executeTaskFrame({ controller: owner }, (task) => {
		ownReleasableTaskResource(task, resource, 'dispose');
		task.cleanup(() => releaseTaskResource(task.signal, resource, resource.dispose()));
		return new Promise<void>(() => {});
	});
	owner.abort('cancel');
	await expect(result).rejects.toBeDefined();
	expect(dispose).toHaveBeenCalledTimes(1);
});

it('releases late automatic ownership against the already settled resource lifetime', async () => {
	let retained!: Parameters<Parameters<typeof executeTaskFrame>[1]>[0];
	await executeTaskFrame({}, (task) => {
		retained = task;
	});
	const resource = { dispose: vi.fn() };
	expect(ownReleasableTaskResource(retained, resource, 'dispose')).toBe(resource);
	expect(resource.dispose).toHaveBeenCalledTimes(1);
	expect(retained.signal.aborted).toBe(false);
});

it.each([false, true])(
	'keeps fallback for an absent optional disposer and releases after an undefined result: %s',
	async (present) => {
		const dispose = vi.fn();
		const resource = { dispose };
		await executeTaskFrame({}, (task) => {
			ownReleasableTaskResource(task, resource, 'dispose');
			const method = present
				? function (this: typeof resource, value: number) {
						expect(this).toBe(resource);
						expect(value).toBe(7);
						this.dispose();
					}
				: undefined;
			taskResourceReleaseMethod(task.signal, resource, method)?.(7);
		});
		expect(dispose).toHaveBeenCalledTimes(1);
	}
);

it('preserves a throwing optional disposer and keeps fallback ownership', async () => {
	const failure = new Error('native disposal failed');
	const resource = { dispose: vi.fn() };
	await expect(
		executeTaskFrame({}, (task) => {
			ownReleasableTaskResource(task, resource, 'dispose');
			taskResourceReleaseMethod(task.signal, resource, () => {
				throw failure;
			})?.();
		})
	).rejects.toBe(failure);
	expect(resource.dispose).toHaveBeenCalledTimes(1);
});

it('returns the exact promise from an optional native disposer', async () => {
	const promise = Promise.resolve();
	const resource = {
		dispose() {
			expect(this).toBe(resource);
			return promise;
		}
	};
	const dispose = vi.spyOn(resource, 'dispose');
	await executeTaskFrame({}, (task) => {
		ownReleasableTaskResource(task, resource, 'dispose');
		expect(taskResourceReleaseMethod(task.signal, resource, resource.dispose)?.()).toBe(promise);
		return promise;
	});
	expect(dispose).toHaveBeenCalledTimes(1);
});

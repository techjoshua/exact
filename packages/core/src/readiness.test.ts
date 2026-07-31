import { describe, expect, it, vi } from 'vitest';
import { createReadinessCoordinator } from './index.js';

describe('@exactjs/core readiness coordination', () => {
	it('fences stale settlements when a boundary starts a new generation', async () => {
		const changes: Array<[number, number]> = [];
		const coordinator = createReadinessCoordinator((pending, generation) =>
			changes.push([pending, generation])
		);
		coordinator.beginGeneration();
		let settle!: () => void;
		const settlement = new Promise<void>((resolve) => {
			settle = resolve;
		});
		coordinator.context.register({
			owner: {} as never,
			taskGeneration: 1,
			settlement
		});
		expect(coordinator.pending).toBe(1);

		coordinator.beginGeneration();
		settle();
		await Promise.resolve();
		expect(coordinator.pending).toBe(0);
		expect(coordinator.generation).toBe(2);
		expect(changes.at(-1)?.[0]).toBe(0);
	});

	it('publishes settled generation effects only on commit and discards superseded effects', async () => {
		const coordinator = createReadinessCoordinator(() => undefined);
		const commit = vi.fn();
		const discard = vi.fn();
		coordinator.beginGeneration();
		coordinator.context.register({
			owner: {} as never,
			taskGeneration: 1,
			settlement: Promise.resolve(),
			commit,
			discard
		});
		await Promise.resolve();
		expect(commit).not.toHaveBeenCalled();
		coordinator.commitGeneration();
		expect(commit).toHaveBeenCalledTimes(1);
		expect(discard).not.toHaveBeenCalled();

		coordinator.beginGeneration();
		coordinator.context.register({
			owner: {} as never,
			taskGeneration: 2,
			settlement: Promise.resolve(),
			commit,
			discard
		});
		await Promise.resolve();
		coordinator.beginGeneration();
		expect(discard).toHaveBeenCalledTimes(1);
	});

	it('commits settled registrations immediately for isolated SSR candidates', async () => {
		const coordinator = createReadinessCoordinator(() => undefined, { commitSettled: true });
		const commit = vi.fn();
		coordinator.beginGeneration();
		coordinator.context.register({
			owner: {} as never,
			taskGeneration: 1,
			settlement: Promise.resolve(),
			commit
		});

		await Promise.resolve();

		expect(commit).toHaveBeenCalledTimes(1);
		expect(coordinator.pending).toBe(0);
	});
});

import {
	batch,
	effectScopeWorkPriority,
	ref as reactiveRef,
	runWithPriority,
	scheduleWork,
	subscribe,
	unwrap,
	type ReactiveRef,
	type ReactiveValue
} from '@exactjs/reactive';

import type {
	ComponentInstance,
	ComponentReactiveValue,
	TaskContext,
	TaskPolicy,
	TaskRegistration,
	TaskResult
} from '../component/contracts.js';

import { createErrorReport, handleComponentError } from '../component/errors.js';
import { componentReadinessContext } from '../component/readiness.js';

import { isPromiseLike } from '../component/async-value.js';
import { observeTaskPromise } from './observers.js';

import {
	discardTaskMutations,
	drainTaskCleanupPromises,
	publishTaskMutations,
	trackTaskOwner
} from './resources.js';

/** Creates a task. */
export function createTask(
	instance: ComponentInstance<any>,
	deps: unknown[],
	work: (...args: any[]) => TaskResult,
	policy: TaskPolicy = {
		placement: 'inferred',
		priority: 'normal',
		readiness: 'nonblocking'
	}
): TaskRegistration {
	const sources = deps
		.map((dep) => reactiveRef(dep))
		.filter((source): source is ReactiveRef => !!source);
	const startQueuedGeneration = (): void => {
		const generation = task.queuedGeneration;
		if (generation !== undefined) startTaskGeneration(task, instance, generation);
	};
	const scheduleTaskGeneration = (): void => {
		const priority = effectScopeWorkPriority(instance.scope, task.policy.priority);
		if (priority === 'deferred') {
			scheduleWork(startQueuedGeneration, 'deferred', undefined, instance.scope);
			return;
		}
		startQueuedGeneration();
	};
	const task: TaskRegistration = {
		deps,
		sources,
		work,
		policy,
		stops: [],
		generation: 0,
		stopped: false,
		run() {
			const generation = ++task.generation;
			task.readinessRegistration?.cancel();
			task.readinessRegistration = undefined;
			task.queuedGeneration = generation;
			task.stopped = false;
			const previousSignal = task.controller?.signal;
			task.controller?.abort('rerun');
			const cleanupSettlement = runTaskCleanup(task, instance);
			const resourceSettlement = drainTaskCleanupPromises(previousSignal);
			if (!task.stops.length) {
				task.stops = task.sources.map((source) =>
					subscribe(source, () => task.run(), { scope: instance.scope })
				);
			}
			// Compiler-rewritten awaits use taskAwait(), which actively rejects on
			// abort, so the prior generation settles even when its input promise does
			// not. Waiting here preserves generation and cleanup serialization.
			const priorSettlement =
				task.settlement && previousSignal
					? settleWhenAborted(task.settlement, previousSignal)
					: task.settlement;
			const pending = [priorSettlement, cleanupSettlement, resourceSettlement].filter(
				(value): value is Promise<void> => !!value
			);
			if (pending.length) {
				const barrier = Promise.all(pending).then(() => undefined);
				task.settlement = barrier;
				observeTaskPromise(barrier, instance);
				void barrier.then(() => {
					if (task.settlement !== barrier) return;
					task.settlement = undefined;
					if (!task.stopped && task.queuedGeneration === generation) scheduleTaskGeneration();
				});
				return;
			}
			scheduleTaskGeneration();
		},
		resume() {
			task.stopped = false;
			if (!task.stops.length) {
				// Establish computed dependency edges and the SSR baseline without
				// invoking authored work; later changes schedule a normal generation.
				for (const dependency of task.deps) unwrap(dependency);
				task.stops = task.sources.map((source) =>
					subscribe(source, () => task.run(), { scope: instance.scope })
				);
			}
		},
		stop() {
			task.stopped = true;
			task.queuedGeneration = undefined;
			task.generation++;
			task.readinessRegistration?.cancel();
			task.readinessRegistration = undefined;
			const signal = task.controller?.signal;
			task.controller?.abort('unmount');
			const cleanupSettlement = runTaskCleanup(task, instance);
			const resourceSettlement = drainTaskCleanupPromises(signal);
			for (const promise of [task.settlement, cleanupSettlement, resourceSettlement]) {
				if (promise) observeTaskPromise(promise, instance);
			}
			for (const stop of task.stops) stop();
			task.stops = [];
		}
	};

	return task;
}

function settleWhenAborted(settlement: Promise<void>, signal: AbortSignal): Promise<void> {
	if (signal.aborted) return Promise.resolve();
	return Promise.race([
		settlement,
		new Promise<void>((resolve) =>
			signal.addEventListener('abort', () => resolve(), { once: true })
		)
	]);
}

function startTaskGeneration(
	task: TaskRegistration,
	instance: ComponentInstance<any>,
	generation: number
): void {
	if (task.stopped || task.queuedGeneration !== generation || task.generation !== generation)
		return;
	task.queuedGeneration = undefined;
	const controller = new AbortController();
	task.controller = controller;
	trackTaskOwner(controller.signal, instance);
	const values = task.deps.map((dep) => unwrap(dep));
	let result: TaskResult;
	try {
		result = runWithPriority(effectScopeWorkPriority(instance.scope, task.policy.priority), () =>
			batch(() => task.work(...values, { signal: controller.signal }))
		);
	} catch (error) {
		handleComponentError(instance, createErrorReport(error, 'task', instance, 'run'));
		return;
	}

	if (isPromiseLike(result)) {
		const observed = Promise.resolve(result)
			.then((cleanup) => {
				if (task.generation === generation && task.controller === controller)
					task.completedGeneration = generation;
				if (typeof cleanup !== 'function') return;
				if (
					task.generation === generation &&
					task.controller === controller &&
					!controller.signal.aborted
				) {
					task.cleanup = cleanup;
				} else {
					return Promise.resolve(cleanup()).catch((error) => {
						handleComponentError(
							instance,
							createErrorReport(error, 'task', instance, 'stale-cleanup')
						);
					});
				}
			})
			.catch((error) => {
				if (task.generation !== generation || (controller.signal.aborted && isAbortError(error)))
					return;
				task.failedGeneration = generation;
				handleComponentError(instance, createErrorReport(error, 'task', instance, 'promise'));
			});
		const settlement = observed.then(() => undefined);
		task.settlement = settlement;
		if (task.policy.readiness === 'blocking') {
			const blockingWork = {
				owner: instance,
				taskGeneration: generation,
				settlement,
				commit: () => {
					if (task.failedGeneration === generation) discardTaskMutations(controller.signal);
					else publishTaskMutations(controller.signal);
				},
				discard: () => discardTaskMutations(controller.signal)
			};
			const readiness = componentReadinessContext(instance);
			if (readiness) task.readinessRegistration = readiness.register(blockingWork);
			else
				void settlement.then(() => {
					if (
						task.generation === generation &&
						task.controller === controller &&
						!controller.signal.aborted
					)
						blockingWork.commit();
				});
		}
		observeTaskPromise(settlement, instance);
		void settlement.then(() => {
			if (task.settlement === settlement) task.settlement = undefined;
		});
	} else {
		task.completedGeneration = generation;
		if (typeof result === 'function') task.cleanup = result;
	}
}

function runTaskCleanup(
	task: TaskRegistration,
	instance: ComponentInstance<any>
): Promise<void> | undefined {
	const cleanup = task.cleanup;
	task.cleanup = undefined;
	if (!cleanup) return undefined;
	try {
		const result = cleanup();
		if (!isPromiseLike(result)) return undefined;
		return Promise.resolve(result).catch((error) => {
			handleComponentError(instance, createErrorReport(error, 'task', instance, 'cleanup'));
		});
	} catch (error) {
		handleComponentError(instance, createErrorReport(error, 'task', instance, 'cleanup'));
		return undefined;
	}
}

function isAbortError(error: unknown): boolean {
	return (
		(error instanceof DOMException && error.name === 'AbortError') ||
		(!!error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError')
	);
}

/** Creates a component reactive value. */
export function createComponentReactiveValue<T>(
	instance: ComponentInstance<any>,
	value: ReactiveValue<T>,
	start: (task: TaskRegistration) => void = (task) => task.run()
): ComponentReactiveValue<T> {
	return Object.assign(value, {
		task(work: (value: T, ctx: TaskContext) => TaskResult): void {
			const task = createTask(instance, [value], work as (...args: any[]) => TaskResult);
			instance.tasks.push(task);
			start(task);
		}
	});
}

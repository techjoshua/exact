import type { Component } from '../component/contracts.js';
import { taskOwnerForHost } from './owner-hosts.js';
import { executeTaskFrame, joinTask } from './frame-runtime.js';
import type { TaskContext } from './contracts.js';

/**
 * Defines the compiler-proven invocation-only client/latest lane.
 *
 * The compiler selects this ABI only when the callable is used exclusively through invocation and
 * the callable does not escape invocation sites or expose task status. Each generation still uses
 * the complete task-frame context, structural settlement, cleanup, cancellation, and ownership
 * contracts; the specialization removes only the general definition, keyed-lane, queue, and status
 * machinery. General tasks continue to use the complete observable task runtime.
 */
export function defineClientLatestTaskForHost<Args extends unknown[], Result>(
	host: Component<object>,
	label: string,
	work: (...args: [...Args, TaskContext]) => Result | PromiseLike<Result>
): (...args: Args) => Promise<Awaited<Result>> {
	let generation = 0;
	let active: AbortController | undefined;
	let disposed = false;
	host.onUnmount(({ reason }) => {
		disposed = true;
		active?.abort(reason ?? 'component unmounted');
		active = undefined;
	});
	return (...args: Args) => {
		if (disposed) return Promise.reject(new Error('Task owner has been disposed'));
		active?.abort('superseded');
		const controller = new AbortController();
		active = controller;
		const currentGeneration = ++generation;
		const owner = taskOwnerForHost(host);
		if (!owner) return Promise.reject(new Error('Task host has no task owner'));
		const promise = executeTaskFrame(
			{
				owner,
				controller,
				generation: currentGeneration,
				activation: 'invoked',
				label,
				placement: 'client',
				concurrency: 'latest',
				priority: 'normal',
				readiness: 'nonblocking'
			},
			(context) => work(...args, context)
		).finally(() => {
			if (active === controller) active = undefined;
		}) as Promise<Awaited<Result>>;
		void promise.catch(() => undefined);
		return promise;
	};
}

/** Defines a compiler-proven invocation-only client/parallel lane. */
export function defineClientParallelTaskForHost<Args extends unknown[], Result>(
	host: Component<object>,
	label: string,
	work: (...args: [...Args, TaskContext]) => Result | PromiseLike<Result>
): (...args: Args) => Promise<Awaited<Result>> {
	let generation = 0;
	let disposed = false;
	const active = new Set<AbortController>();
	host.onUnmount(({ reason }) => {
		disposed = true;
		for (const controller of active) controller.abort(reason ?? 'component unmounted');
		active.clear();
	});
	return (...args: Args) => {
		if (disposed) return Promise.reject(new Error('Task owner has been disposed'));
		const owner = taskOwnerForHost(host);
		if (!owner) return Promise.reject(new Error('Task host has no task owner'));
		const controller = new AbortController();
		active.add(controller);
		return executeTaskFrame(
			{
				owner,
				controller,
				generation: ++generation,
				activation: 'invoked',
				label,
				placement: 'client',
				concurrency: 'parallel',
				priority: 'normal',
				readiness: 'nonblocking'
			},
			(context) => work(...args, context)
		).finally(() => active.delete(controller)) as Promise<Awaited<Result>>;
	};
}

/** Defines a compiler-proven invocation-only client/queue lane. */
export function defineClientQueueTaskForHost<Args extends unknown[], Result>(
	host: Component<object>,
	label: string,
	work: (...args: [...Args, TaskContext]) => Result | PromiseLike<Result>
): (...args: Args) => Promise<Awaited<Result>> {
	type Entry = {
		args: Args;
		resolve(value: Awaited<Result>): void;
		reject(error: unknown): void;
	};
	let generation = 0;
	let disposed = false;
	let active: AbortController | undefined;
	const queue: Entry[] = [];
	const pump = () => {
		if (active || disposed) return;
		const entry = queue.shift();
		if (!entry) return;
		const owner = taskOwnerForHost(host);
		if (!owner) {
			entry.reject(new Error('Task host has no task owner'));
			pump();
			return;
		}
		const controller = new AbortController();
		active = controller;
		void executeTaskFrame(
			{
				owner,
				controller,
				generation: ++generation,
				activation: 'invoked',
				label,
				placement: 'client',
				concurrency: 'queue',
				priority: 'normal',
				readiness: 'nonblocking'
			},
			(context) => work(...entry.args, context)
		)
			.then((value) => entry.resolve(value as Awaited<Result>), entry.reject)
			.finally(() => {
				active = undefined;
				pump();
			});
	};
	host.onUnmount(({ reason }) => {
		disposed = true;
		active?.abort(reason ?? 'component unmounted');
		const error = new Error(reason ?? 'component unmounted');
		for (const entry of queue.splice(0)) entry.reject(error);
	});
	return (...args: Args) => {
		if (disposed) return Promise.reject(new Error('Task owner has been disposed'));
		const promise = new Promise<Awaited<Result>>((resolve, reject) => {
			queue.push({ args, resolve, reject });
		});
		void promise.catch(() => undefined);
		joinTask(promise);
		pump();
		return promise;
	};
}

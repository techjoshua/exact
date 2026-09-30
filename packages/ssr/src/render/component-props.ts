import { resumeSsrWork } from './resume-scheduling.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { plannedContinuationDependency } from '@exactjs/core';
import { serverComponentDependencyForValue } from '@exactjs/core/framework/server-component-execution';
import { isReactiveValue } from '@exactjs/reactive/framework/values';

/** Resolves pending values needed by component initialization while preserving planned task-input sources. */
export function prepareComponentProps(
	props: Record<string, unknown>,
	deferredTaskProps: readonly string[] | undefined,
	options: SsrRenderOptions
): Record<string, unknown> | Promise<Record<string, unknown>> {
	return prepareProps(props, deferredTaskProps, options, false);
}

/**
 * Snapshots reactive expressions for direct server execution, which has no reactive props proxy.
 * Deferred task inputs retain their dependency sources after expression evaluation so the server
 * scheduler still owns their readiness. Ordinary component instances keep their reactive inputs.
 */
export function prepareDirectComponentProps(
	props: Record<string, unknown>,
	deferredTaskProps: readonly string[] | undefined,
	options: SsrRenderOptions
): Record<string, unknown> | Promise<Record<string, unknown>> {
	return prepareProps(props, deferredTaskProps, options, true);
}

/** Resolves source readiness while adapting expressions only for the direct server caller. */
function prepareProps(
	props: Record<string, unknown>,
	deferredTaskProps: readonly string[] | undefined,
	options: SsrRenderOptions,
	snapshotExpressions: boolean
): Record<string, unknown> | Promise<Record<string, unknown>> {
	let resolved: Record<string, unknown> | undefined;
	let pending: Promise<readonly [key: string, value: unknown]>[] | undefined;
	for (const key in props) {
		if (!Object.hasOwn(props, key)) continue;
		const deferred = deferredTaskProps?.includes(key);
		if (deferred && !snapshotExpressions) continue;
		let value = props[key];
		if (snapshotExpressions && isReactiveValue(value)) {
			value = value.get();
			resolved ??= { ...props };
			resolved[key] = value;
		}
		if (deferred) continue;
		if (value === null || (typeof value !== 'object' && typeof value !== 'function')) continue;
		const source = serverComponentDependencyForValue(value) ?? plannedContinuationDependency(value);
		if (!source) continue;
		const snapshot = source.read();
		if (snapshot.status === 'pending') {
			(pending ??= []).push(
				availableSnapshot(source, options.signal).then((available) => [
					key,
					settledValue(key, available)
				])
			);
			continue;
		}
		if (!resolved) resolved = { ...props };
		resolved[key] = settledValue(key, snapshot);
	}
	if (pending)
		return Promise.all(pending).then((entries) => {
			const output = resolved ?? { ...props };
			for (const [key, value] of entries) output[key] = value;
			return resumeSsrWork(options, () => output);
		});
	return resolved ?? props;
}
function settledValue(
	key: string,
	snapshot: ReturnType<
		NonNullable<
			| ReturnType<typeof plannedContinuationDependency>
			| ReturnType<typeof serverComponentDependencyForValue>
		>['read']
	>
): unknown {
	if (snapshot.status === 'failed') throw snapshot.error;
	if (snapshot.status === 'cancelled')
		throw snapshot.reason ?? new Error(`Component prop ${key} was cancelled before setup`);
	if (snapshot.status !== 'available') throw new Error(`Component prop ${key} did not settle`);
	return snapshot.value;
}

function availableSnapshot(
	source: NonNullable<
		| ReturnType<typeof plannedContinuationDependency>
		| ReturnType<typeof serverComponentDependencyForValue>
	>,
	signal: AbortSignal | undefined
): Promise<ReturnType<typeof source.read>> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}
		const subscription: { current?: Disposable } = {};
		let settled = false;
		const finish = (): void => {
			if (settled) return;
			const snapshot = source.read();
			if (snapshot.status === 'pending') return;
			settled = true;
			subscription.current?.[Symbol.dispose]();
			signal?.removeEventListener('abort', abort);
			resolve(snapshot);
		};
		const abort = (): void => {
			settled = true;
			subscription.current?.[Symbol.dispose]();
			reject(signal?.reason);
		};
		signal?.addEventListener('abort', abort, { once: true });
		subscription.current = source.subscribe(finish);
		if (settled) subscription.current[Symbol.dispose]();
		finish();
	});
}

import { plannedContinuationDependency } from '@exactjs/core';
import { serverComponentDependencyForValue } from '@exactjs/core/framework/server-component-execution';

/** Resolves pending values needed by component initialization while preserving planned task-input sources. */
export function prepareComponentProps(
	props: Record<string, unknown>,
	deferredTaskProps: readonly string[] | undefined,
	signal: AbortSignal | undefined
): Record<string, unknown> | Promise<Record<string, unknown>> {
	let resolved: Record<string, unknown> | undefined;
	let pending: Promise<readonly [key: string, value: unknown]>[] | undefined;
	for (const key in props) {
		if (!Object.hasOwn(props, key) || deferredTaskProps?.includes(key)) continue;
		const source =
			serverComponentDependencyForValue(props[key]) ?? plannedContinuationDependency(props[key]);
		if (!source) continue;
		const snapshot = source.read();
		if (snapshot.status === 'pending') {
			(pending ??= []).push(
				availableSnapshot(source, signal).then((available) => [key, settledValue(key, available)])
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
			return output;
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

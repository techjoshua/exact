import { plannedContinuationDependency } from '@exactjs/core';
import type { PreparedComponentExecution } from '@exactjs/core/framework/component-execution';

const noPlannedInputs: ReadonlySet<string> = new Set();

/** Resolves pending values needed by authored setup while preserving planned task-input sources. */
export async function prepareComponentProps(
	props: Record<string, unknown>,
	execution: PreparedComponentExecution | undefined,
	signal: AbortSignal | undefined
): Promise<Record<string, unknown>> {
	const plannedInputs = execution?.setupPropNames ?? noPlannedInputs;
	let resolved: Record<string, unknown> | undefined;
	for (const key in props) {
		if (!Object.hasOwn(props, key) || plannedInputs.has(key)) continue;
		const source = plannedContinuationDependency(props[key]);
		if (!source) continue;
		let snapshot = source.read();
		if (snapshot.status === 'pending') snapshot = await availableSnapshot(source, signal);
		if (snapshot.status === 'failed') throw snapshot.error;
		if (snapshot.status === 'cancelled')
			throw snapshot.reason ?? new Error(`Component prop ${key} was cancelled before setup`);
		if (snapshot.status !== 'available') throw new Error(`Component prop ${key} did not settle`);
		if (!resolved) resolved = { ...props };
		resolved[key] = snapshot.value;
	}
	return resolved ?? props;
}

function availableSnapshot(
	source: NonNullable<ReturnType<typeof plannedContinuationDependency>>,
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

import { plannedContinuationDependency, type ExactComponentExecutionContract } from '@exactjs/core';

/** Resolves pending values needed by authored setup while preserving planned task-input sources. */
export async function prepareComponentProps(
	props: Record<string, unknown>,
	execution: ExactComponentExecutionContract | undefined,
	signal: AbortSignal | undefined
): Promise<Record<string, unknown>> {
	const plannedInputs = setupPropInputs(execution);
	let resolved: Record<string, unknown> | undefined;
	for (const key of Reflect.ownKeys(props)) {
		if (typeof key !== 'string' || plannedInputs.has(key)) continue;
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

function setupPropInputs(execution: ExactComponentExecutionContract | undefined): Set<string> {
	const indexes = new Set(
		execution?.transitions
			.filter((transition) => transition.activation === 'setup')
			.flatMap((transition) => transition.inputs) ?? []
	);
	return new Set(
		(execution?.ports ?? [])
			.filter((port) => port.kind === 'props' && indexes.has(port.index))
			.map((port) => port.path.replace(/^props\./, '').split('.')[0]!)
	);
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

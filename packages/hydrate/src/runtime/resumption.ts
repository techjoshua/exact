import {
	readExactComponentContract,
	withComponentResumption,
	type ComponentDomain,
	type ComponentFunction,
	type ComponentResumptionActivation
} from '@exactjs/core';

/** Ordered resolver with checkpoints for fallible DOM adoption. */
export type ComponentResumptionResolver = ((
	type: ComponentFunction<any, any>
) => ComponentResumptionActivation | undefined) & {
	checkpoint(): number;
	rollback(checkpoint: number): void;
};

const resolvers = new WeakMap<ComponentDomain, ComponentResumptionResolver>();

/** Creates the ordered, contract-checked source of SSR component activations. */
export function createComponentResumptionResolver(
	records: () => readonly ComponentResumptionActivation[] | undefined
): ComponentResumptionResolver {
	let index = 0;
	const resolve = ((type: ComponentFunction<any, any>) => {
		const contract = readExactComponentContract(type);
		if (!contract?.resumption) return undefined;
		const available = records();
		if (!available?.length) throw new Error('eXact SSR resumption payload is unavailable');
		const record = available[index];
		if (!record) throw new Error(`eXact SSR resumption is missing component ${contract.id}`);
		if (record.componentId !== contract.id)
			throw new Error(
				`eXact SSR resumption expected component ${record.componentId}, received ${contract.id}`
			);
		const allowedPaths = new Set(contract.resumption.statePaths);
		for (const path of Object.keys(record.values)) {
			if (!allowedPaths.has(path))
				throw new Error(
					`eXact SSR resumption contains undeclared state path ${contract.id}:${path}`
				);
		}
		const allowedContexts = new Set(contract.resumption.contexts);
		for (const name of Object.keys(record.contexts)) {
			if (!allowedContexts.has(name))
				throw new Error(`eXact SSR resumption contains undeclared context ${contract.id}:${name}`);
		}
		const allowedContinuations = new Set(
			contract.continuations.map((continuation) => continuation.id)
		);
		for (const id of record.settledContinuations) {
			if (!allowedContinuations.has(id))
				throw new Error(
					`eXact SSR resumption contains undeclared continuation ${contract.id}:${id}`
				);
		}
		index++;
		return record;
	}) as ComponentResumptionResolver;
	resolve.checkpoint = () => index;
	resolve.rollback = (checkpoint) => {
		if (!Number.isSafeInteger(checkpoint) || checkpoint < 0 || checkpoint > index)
			throw new Error('Malformed eXact component resumption checkpoint');
		index = checkpoint;
	};
	return resolve;
}

/** Associates one hydration-owned component domain with its activation transaction. */
export function bindComponentResumptionResolver(
	domain: ComponentDomain,
	resolver: ComponentResumptionResolver
): void {
	resolvers.set(domain, resolver);
}

/** Captures the current activation cursor before a fallible adoption attempt. */
export function checkpointComponentResumptions(domain: ComponentDomain): number {
	return resolvers.get(domain)?.checkpoint() ?? 0;
}

/** Retries a known component fallback with its rolled-back SSR activations. */
export function withComponentResumptionFallback<T>(domain: ComponentDomain, work: () => T): T {
	const resolver = resolvers.get(domain);
	if (!resolver) return work();
	const checkpoint = resolver.checkpoint();
	try {
		return withComponentResumption(domain, work);
	} catch (error) {
		resolver.rollback(checkpoint);
		throw error;
	}
}

/** Restores activations consumed by a failed adoption attempt. */
export function rollbackComponentResumptions(domain: ComponentDomain, checkpoint: number): void {
	resolvers.get(domain)?.rollback(checkpoint);
}

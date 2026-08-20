import {
	withComponentResumption,
	type ComponentDomain,
	type ComponentFunction,
	type ComponentResumptionActivation
} from '@exactjs/core';
import {
	exactComponentIdentity,
	readExactComponentContract
} from '@exactjs/core/framework/component-contracts';
import { componentDomainResumption } from '@exactjs/core/framework/component-domains';

/** Ordered resolver with checkpoints for fallible DOM adoption. */
export type ComponentResumptionResolver = ((
	type: ComponentFunction<any, any>
) => ComponentResumptionActivation | undefined) & {
	checkpoint(): number;
	rollback(checkpoint: number): void;
};

/** Creates the ordered, contract-checked source of SSR component activations. */
export function createComponentResumptionResolver(
	records: () => readonly ComponentResumptionActivation[] | undefined
): ComponentResumptionResolver {
	const consumed = new Set<number>();
	const history: number[] = [];
	const resolve = ((type: ComponentFunction<any, any>) => {
		const contract = readExactComponentContract(type);
		if (!contract?.resumption) return undefined;
		const componentId = exactComponentIdentity(type);
		const available = records();
		if (!available?.length) throw new Error('eXact SSR resumption payload is unavailable');
		const recordIndex = available.findIndex(
			(record, candidate) => !consumed.has(candidate) && record.componentId === componentId
		);
		if (recordIndex < 0)
			throw new Error(`eXact SSR resumption is missing component ${componentId}`);
		const record = available[recordIndex]!;
		const allowedPaths = new Set(contract.resumption.statePaths);
		for (const path of Object.keys(record.values)) {
			if (!allowedPaths.has(path))
				throw new Error(
					`eXact SSR resumption contains undeclared state path ${componentId}:${path}`
				);
		}
		const allowedContexts = new Set(contract.resumption.contexts);
		for (const name of Object.keys(record.contexts)) {
			if (!allowedContexts.has(name))
				throw new Error(`eXact SSR resumption contains undeclared context ${componentId}:${name}`);
		}
		const allowedContinuations = new Set(
			contract.continuations.map((continuation) => continuation.id)
		);
		for (const id of record.settledContinuations) {
			if (!allowedContinuations.has(id))
				throw new Error(
					`eXact SSR resumption contains undeclared continuation ${componentId}:${id}`
				);
		}
		consumed.add(recordIndex);
		history.push(recordIndex);
		return record;
	}) as ComponentResumptionResolver;
	resolve.checkpoint = () => history.length;
	resolve.rollback = (checkpoint) => {
		if (!Number.isSafeInteger(checkpoint) || checkpoint < 0 || checkpoint > history.length)
			throw new Error('Malformed eXact component resumption checkpoint');
		while (history.length > checkpoint) consumed.delete(history.pop()!);
	};
	return resolve;
}

/** Captures the current activation cursor before a fallible adoption attempt. */
export function checkpointComponentResumptions(domain: ComponentDomain): number {
	return resolverForDomain(domain)?.checkpoint() ?? 0;
}

/** Retries a known component fallback with its rolled-back SSR activations. */
export function withComponentResumptionFallback<T>(domain: ComponentDomain, work: () => T): T {
	const resolver = resolverForDomain(domain);
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
	resolverForDomain(domain)?.rollback(checkpoint);
}

function resolverForDomain(domain: ComponentDomain): ComponentResumptionResolver | undefined {
	return componentDomainResumption(domain) as ComponentResumptionResolver | undefined;
}

import {
	type AnyComponentFunction,
	withComponentResumption,
	type ComponentDomain,
	type ComponentResumptionActivation
} from '@exactjs/core';
import {
	exactComponentIdentity,
	readPreparedExactClientExecutableComponentContract
} from '@exactjs/core/framework/component-contracts';
import { componentDomainResumption } from '@exactjs/core/framework/component-domains';

/** Ordered resolver with checkpoints for fallible DOM adoption. */
export type ComponentResumptionResolver = ((
	type: AnyComponentFunction
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
	const resolve = ((type: AnyComponentFunction) => {
		const contract = readPreparedExactClientExecutableComponentContract(type);
		if (!contract.resumption) return undefined;
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
		const values = expandIndexedFields(record.values, contract.resumption.statePaths, componentId);
		for (const path of Object.keys(values)) {
			if (!allowedPaths.has(path))
				throw new Error(
					`eXact SSR resumption contains undeclared state path ${componentId}:${path}`
				);
		}
		const allowedContexts = new Set(contract.resumption.contexts);
		const contexts = expandIndexedFields(
			record.contexts,
			contract.resumption.contexts,
			componentId
		);
		for (const name of Object.keys(contexts)) {
			if (!allowedContexts.has(name))
				throw new Error(`eXact SSR resumption contains undeclared context ${componentId}:${name}`);
		}
		const allowedContinuations = new Set(
			(contract.continuations ?? []).map((continuation) => continuation.id)
		);
		for (const id of record.settledContinuations) {
			if (!allowedContinuations.has(id))
				throw new Error(
					`eXact SSR resumption contains undeclared continuation ${componentId}:${id}`
				);
		}
		consumed.add(recordIndex);
		history.push(recordIndex);
		return { ...record, values, contexts };
	}) as ComponentResumptionResolver;
	resolve.checkpoint = () => history.length;
	resolve.rollback = (checkpoint) => {
		if (!Number.isSafeInteger(checkpoint) || checkpoint < 0 || checkpoint > history.length)
			throw new Error('Malformed eXact component resumption checkpoint');
		while (history.length > checkpoint) consumed.delete(history.pop()!);
	};
	return resolve;
}

/** Expands compiler indexes only after the receiving component contract supplies their names. */
function expandIndexedFields(
	values: Readonly<Record<string, unknown>>,
	fields: readonly string[],
	componentId: string
): Readonly<Record<string, unknown>> {
	const keys = Object.keys(values);
	if (!keys.some((key) => key.startsWith('@'))) return values;
	const output: Record<string, unknown> = {};
	for (const key of keys) {
		if (!key.startsWith('@')) {
			if (Object.prototype.hasOwnProperty.call(output, key))
				throw new Error(`Duplicate eXact resumption field ${componentId}:${key}`);
			output[key] = values[key];
			continue;
		}
		if (!/^@(?:0|[1-9]\d*)$/.test(key))
			throw new Error(`Malformed eXact indexed resumption ${componentId}`);
		const index = Number(key.slice(1));
		const field = fields[index];
		if (field === undefined)
			throw new Error(`eXact SSR resumption index is outside component ${componentId}`);
		if (Object.prototype.hasOwnProperty.call(output, field))
			throw new Error(`Duplicate eXact resumption field ${componentId}:${field}`);
		output[field] = values[key];
	}
	return output;
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

import {
	type AnyComponentFunction,
	withComponentResumption,
	type ComponentDomain
} from '@exactjs/core';
import {
	exactComponentIdentity,
	readPreparedExactClientExecutableComponentContract
} from '@exactjs/core/framework/component-contracts';
import { componentDomainResumption } from '@exactjs/core/framework/component-domains';
import type { ComponentResumptionSource } from '@exactjs/core/framework/component-domains';

/** Ordered resolver with checkpoints for fallible DOM adoption. */
export type ComponentResumptionResolver<
	Source extends ComponentResumptionSource = ComponentResumptionSource
> = ((type: AnyComponentFunction) => Source | undefined) & {
	checkpoint(): number;
	rollback(checkpoint: number): void;
};

/** Creates the ordered, contract-checked source of SSR component activations. */
export function createComponentResumptionResolver<Source extends ComponentResumptionSource>(
	records: () => readonly Source[] | undefined
): ComponentResumptionResolver<Source> {
	let cursor = 0;
	const resolve = ((type: AnyComponentFunction) => {
		const contract = readPreparedExactClientExecutableComponentContract(type);
		if (!contract.resumption) return undefined;
		const componentId = exactComponentIdentity(type);
		const available = records();
		if (!available?.length) throw new Error('eXact SSR resumption payload is unavailable');
		const record = available[cursor] as ComponentResumptionSource | undefined;
		if (!record) throw new Error(`eXact SSR resumption is missing component ${componentId}`);
		const indexedRecord = !('componentId' in record);
		const recordComponentId = indexedRecord ? record[0] : record.componentId;
		if (recordComponentId !== componentId)
			throw new Error(
				`eXact SSR resumption expected component ${recordComponentId} before ${componentId}`
			);
		const values = indexedRecord ? (record[1] ?? []) : record.values;
		const contexts = indexedRecord ? (record[2] ?? []) : record.contexts;
		const settledContinuations = indexedRecord ? (record[3] ?? []) : record.settledContinuations;
		const indexed = Array.isArray(values) && Array.isArray(contexts);
		if (indexed) {
			prepareIndexedFields(
				values as unknown as readonly IndexedResumptionField[],
				contract.resumption.statePaths,
				componentId,
				'state path'
			);
			prepareIndexedFields(
				contexts as unknown as readonly IndexedResumptionField[],
				contract.resumption.contexts,
				componentId,
				'context'
			);
		}
		if (!indexed) {
			validateNamedFields(
				values as Readonly<Record<string, unknown>>,
				contract.resumption.statePaths,
				componentId,
				'state path'
			);
			validateNamedFields(
				contexts as Readonly<Record<string, unknown>>,
				contract.resumption.contexts,
				componentId,
				'context'
			);
		}
		for (const id of settledContinuations) {
			if (!contract.continuations?.some((continuation) => continuation.id === id))
				throw new Error(
					`eXact SSR resumption contains undeclared continuation ${componentId}:${id}`
				);
		}
		cursor++;
		return record;
	}) as ComponentResumptionResolver<Source>;
	resolve.checkpoint = () => cursor;
	resolve.rollback = (checkpoint) => {
		if (!Number.isSafeInteger(checkpoint) || checkpoint < 0 || checkpoint > cursor)
			throw new Error('Malformed eXact component resumption checkpoint');
		cursor = checkpoint;
	};
	return resolve;
}

type IndexedResumptionField = readonly [field: number | string, value: unknown];

/** Resolves compact field cells in place only after the receiving artifact supplies its schema. */
function prepareIndexedFields(
	entries: readonly IndexedResumptionField[],
	fields: readonly string[],
	componentId: string,
	fieldKind: 'state path' | 'context'
): void {
	for (let index = 0; index < entries.length; index++) {
		const rawField = entries[index]![0];
		const field = typeof rawField === 'number' ? fields[rawField] : rawField;
		if (field === undefined)
			throw new Error(`eXact SSR resumption index is outside component ${componentId}`);
		if (typeof rawField === 'string' && !fields.includes(rawField))
			throw new Error(
				`eXact SSR resumption contains undeclared ${fieldKind} ${componentId}:${rawField}`
			);
		for (let previous = 0; previous < index; previous++)
			if (entries[previous]![0] === field)
				throw new Error(`Duplicate eXact resumption field ${componentId}:${field}`);
		(entries[index] as [field: number | string, value: unknown])[0] = field;
	}
}

/** Validates the explicit registration lane against its receiving component contract. */
function validateNamedFields(
	values: Readonly<Record<string, unknown>>,
	fields: readonly string[],
	componentId: string,
	fieldKind: 'state path' | 'context'
): void {
	const keys = Object.keys(values);
	for (const key of keys)
		if (!fields.includes(key))
			throw new Error(
				`eXact SSR resumption contains undeclared ${fieldKind} ${componentId}:${key}`
			);
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

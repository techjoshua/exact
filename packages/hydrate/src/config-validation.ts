import type { ComponentResumptionActivation } from '@exactjs/core';
import type { ExactComponentContinuationContract } from '@exactjs/core/framework/component-contracts';
import {
	isExactContinuationDependency,
	isExactContinuationInvocation,
	isExactContinuationStatePath
} from '@exactjs/core/framework/component-contract-validation';
import { createProtocolRecord, isSafeProtocolKey } from '@exactjs/core/framework/protocol-records';

import type {
	ExactEndpointRoutes,
	ExactSerializedComponentResumption,
	ExactSerializedContinuationContract
} from './types.js';
import { hasOnlyKeys } from './validation.js';
export { positiveLimit } from './limits.js';

const emptyList = Object.freeze([]) as readonly never[];
const emptyRecord = Object.freeze({}) as Readonly<Record<string, never>>;

/** Validates and restores compact serialized continuation defaults. */
export function normalizeContinuationMap(
	value: unknown
): Record<string, ExactComponentContinuationContract> | undefined {
	if (value === undefined) return undefined;
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new TypeError('Malformed eXact hydration continuations');
	const entries = Object.entries(value as Record<string, unknown>);
	if (!entries.length) return emptyRecord;
	const output = createProtocolRecord<ExactComponentContinuationContract>();
	for (const [id, continuation] of entries) {
		if (!isSafeProtocolKey(id)) throw new TypeError(`Malformed eXact hydration continuation ${id}`);
		if (!isContinuation(continuation))
			throw new TypeError(`Malformed eXact hydration continuation ${id}`);
		output[id] = normalizeContinuation(continuation);
	}
	return output;
}

/** Validates and restores compact serialized resumption defaults. */
export function normalizeComponentResumptionRegistrations(
	value: unknown
): readonly ComponentResumptionActivation[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) throw new TypeError('Malformed eXact component resumptions');
	if (!value.length) return emptyList;
	return value.map((item, index) => {
		if (!isComponentResumption(item))
			throw new TypeError(`Malformed eXact component resumption ${index}`);
		return {
			componentId: item.componentId,
			values: item.values ?? emptyRecord,
			contexts: item.contexts ?? emptyRecord,
			settledContinuations: item.settledContinuations ?? emptyList
		};
	});
}

/** Validates the single compact representation accepted across the document boundary. */
export function normalizeSerializedComponentResumptions(
	value: unknown
): readonly ComponentResumptionActivation[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) throw new TypeError('Malformed eXact component resumptions');
	if (!value.length) return emptyList;
	return value.map((item, index) => {
		if (!isIndexedComponentResumption(item))
			throw new TypeError(`Malformed eXact component resumption ${index}`);
		return normalizeIndexedResumption(item);
	});
}

type IndexedComponentResumption = readonly [
	componentId: string,
	values?: readonly (readonly [field: number | string, value: unknown])[],
	contexts?: readonly (readonly [field: number | string, value: unknown])[],
	settledContinuations?: readonly string[]
];

/** Restores an indexed wire tuple while deferring contract-index expansion to component adoption. */
function normalizeIndexedResumption(
	item: IndexedComponentResumption
): ComponentResumptionActivation {
	return {
		componentId: item[0],
		values: indexedRecord(item[1]),
		contexts: indexedRecord(item[2]),
		settledContinuations: item[3] ?? emptyList
	};
}

function indexedRecord(
	entries: readonly (readonly [field: number | string, value: unknown])[] | undefined
): Readonly<Record<string, unknown>> {
	if (!entries?.length) return emptyRecord;
	const output = createProtocolRecord<unknown>();
	for (const [field, value] of entries)
		output[typeof field === 'number' ? `@${field}` : field] = value;
	return output;
}

/** Narrows an unknown protocol value to a plain record shape. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Validates serialized invocation and boundary endpoint routing maps. */
export function isEndpointRoutes(value: unknown): value is ExactEndpointRoutes {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	if (!hasOnlyKeys(record, ['invocations', 'boundaries'])) return false;
	return (
		(record.invocations === undefined || isEndpointMap(record.invocations)) &&
		(record.boundaries === undefined || isEndpointMap(record.boundaries))
	);
}

function safeResumptionPath(path: string): boolean {
	return (
		path.length > 0 &&
		path
			.split('.')
			.every(
				(segment) =>
					segment.length > 0 &&
					segment !== '__proto__' &&
					segment !== 'prototype' &&
					segment !== 'constructor'
			)
	);
}

function safeContextName(name: string): boolean {
	return name.length > 0 && name !== '__proto__' && name !== 'prototype' && name !== 'constructor';
}

function isContinuation(value: unknown): value is ExactSerializedContinuationContract {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, [
			'kind',
			'id',
			'componentId',
			'readiness',
			'concurrency',
			'dependencies',
			'invocation',
			'stateReads',
			'stateWrites',
			'publicContexts',
			'serverContexts',
			'contextWrites',
			'serverContextWrites',
			'boundaries'
		]) &&
		record.kind === 'task' &&
		typeof record.id === 'string' &&
		typeof record.componentId === 'string' &&
		(record.readiness === 'blocking' || record.readiness === 'nonblocking') &&
		(record.concurrency === undefined ||
			record.concurrency === 'parallel' ||
			record.concurrency === 'latest' ||
			record.concurrency === 'queue') &&
		(record.dependencies === undefined ||
			(Array.isArray(record.dependencies) &&
				record.dependencies.every(isExactContinuationDependency))) &&
		(record.stateReads === undefined || isStatePathList(record.stateReads)) &&
		(record.stateWrites === undefined || isStatePathList(record.stateWrites)) &&
		(record.publicContexts === undefined || isStringList(record.publicContexts)) &&
		(record.serverContexts === undefined || isStringList(record.serverContexts)) &&
		(record.serverContexts === undefined || record.serverContexts.length === 0) &&
		(record.contextWrites === undefined || isStringList(record.contextWrites)) &&
		(record.serverContextWrites === undefined || isStringList(record.serverContextWrites)) &&
		(record.serverContextWrites === undefined || record.serverContextWrites.length === 0) &&
		(record.invocation === undefined ||
			isExactContinuationInvocation(record.invocation, { argumentsOptional: true })) &&
		(record.boundaries === undefined || isStringList(record.boundaries))
	);
}

function normalizeContinuation(
	value: ExactSerializedContinuationContract
): ExactComponentContinuationContract {
	const { invocation, serverContextWrites: _serverContextWrites, ...fields } = value;
	return {
		...fields,
		dependencies: value.dependencies ?? emptyList,
		stateReads: value.stateReads ?? emptyList,
		stateWrites: value.stateWrites ?? emptyList,
		publicContexts: value.publicContexts ?? emptyList,
		serverContexts: emptyList,
		contextWrites: value.contextWrites ?? emptyList,
		boundaries: value.boundaries ?? emptyList,
		...(invocation === undefined
			? {}
			: { invocation: { ...invocation, arguments: invocation.arguments ?? emptyList } })
	};
}

function isComponentResumption(value: unknown): value is ExactSerializedComponentResumption {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, ['componentId', 'values', 'contexts', 'settledContinuations']) &&
		typeof record.componentId === 'string' &&
		(record.values === undefined ||
			(isRecord(record.values) && Object.keys(record.values).every(safeResumptionPath))) &&
		(record.contexts === undefined ||
			(isRecord(record.contexts) && Object.keys(record.contexts).every(safeContextName))) &&
		(record.settledContinuations === undefined || isStringList(record.settledContinuations))
	);
}

function isIndexedComponentResumption(value: unknown): value is IndexedComponentResumption {
	if (!Array.isArray(value) || value.length < 1 || value.length > 4) return false;
	if (typeof value[0] !== 'string' || value[0].length === 0) return false;
	return (
		indexedPairs(value[1]) &&
		indexedPairs(value[2]) &&
		(value[3] === undefined || isStringList(value[3]))
	);
}

function indexedPairs(value: unknown): boolean {
	if (value === undefined) return true;
	if (!Array.isArray(value)) return false;
	const fields: Array<number | string> = [];
	for (const pair of value) {
		const field = Array.isArray(pair) ? pair[0] : undefined;
		if (
			!Array.isArray(pair) ||
			pair.length !== 2 ||
			!(
				(typeof field === 'number' && Number.isSafeInteger(field) && field >= 0) ||
				(typeof field === 'string' && !field.startsWith('@') && safeResumptionPath(field))
			) ||
			fields.includes(field)
		)
			return false;
		fields.push(field);
	}
	return true;
}

function isStatePathList(value: unknown): boolean {
	return Array.isArray(value) && value.every(isExactContinuationStatePath);
}

function isStringList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isEndpointMap(value: unknown): value is Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	return Object.entries(value as Record<string, unknown>).every(([id, endpoint]) => {
		return id.length > 0 && typeof endpoint === 'string' && endpoint.length > 0;
	});
}

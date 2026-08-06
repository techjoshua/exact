import type {
	ComponentResumptionActivation,
	ExactComponentContinuationContract
} from '@exactjs/core';

import type {
	ExactEndpointRoutes,
	ExactSerializedComponentResumption,
	ExactSerializedContinuationContract
} from './types.js';
import { hasOnlyKeys } from './validation.js';

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
	const output: Record<string, ExactComponentContinuationContract> = {};
	for (const [id, continuation] of entries) {
		if (!isContinuation(continuation))
			throw new TypeError(`Malformed eXact hydration continuation ${id}`);
		output[id] = normalizeContinuation(continuation);
	}
	return output;
}

/** Validates and restores compact serialized resumption defaults. */
export function normalizeComponentResumptions(
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

/** Normalizes a positive integer limit or returns its configured fallback. */
export function positiveLimit(value: number | undefined, fallback: number): number {
	return Number.isSafeInteger(value) && value! > 0 ? value! : fallback;
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
		(record.dependencies === undefined || isContinuationDependencies(record.dependencies)) &&
		(record.stateReads === undefined || isStatePathList(record.stateReads)) &&
		(record.stateWrites === undefined || isStatePathList(record.stateWrites)) &&
		(record.publicContexts === undefined || isStringList(record.publicContexts)) &&
		(record.serverContexts === undefined || isStringList(record.serverContexts)) &&
		(record.serverContexts === undefined || record.serverContexts.length === 0) &&
		(record.contextWrites === undefined || isStringList(record.contextWrites)) &&
		(record.serverContextWrites === undefined || isStringList(record.serverContextWrites)) &&
		(record.serverContextWrites === undefined || record.serverContextWrites.length === 0) &&
		(record.invocation === undefined || isContinuationInvocation(record.invocation)) &&
		(record.boundaries === undefined || isStringList(record.boundaries))
	);
}

function normalizeContinuation(
	value: ExactSerializedContinuationContract
): ExactComponentContinuationContract {
	const { invocation, ...fields } = value;
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

function isContinuationDependencies(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				Boolean(item && typeof item === 'object' && !Array.isArray(item)) &&
				hasOnlyKeys(item as Record<string, unknown>, ['source']) &&
				((item as Record<string, unknown>).source === 'state' ||
					(item as Record<string, unknown>).source === 'props' ||
					(item as Record<string, unknown>).source === 'derived' ||
					(item as Record<string, unknown>).source === 'argument')
		)
	);
}

function isContinuationInvocation(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, ['arguments', 'concurrency']) &&
		Array.isArray(record.arguments) &&
		record.arguments.every(
			(argument) =>
				Boolean(argument && typeof argument === 'object' && !Array.isArray(argument)) &&
				hasOnlyKeys(argument as Record<string, unknown>, ['source']) &&
				(argument as Record<string, unknown>).source === 'argument'
		) &&
		(record.concurrency === 'parallel' ||
			record.concurrency === 'latest' ||
			record.concurrency === 'queue')
	);
}

function isStatePathList(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.every((item) => {
			if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
			const record = item as Record<string, unknown>;
			return (
				hasOnlyKeys(record, ['path', 'kind', 'confidence']) &&
				typeof record.path === 'string' &&
				(record.kind === 'read' || record.kind === 'write') &&
				(record.confidence === 'exact' ||
					record.confidence === 'broad' ||
					record.confidence === 'unknown')
			);
		})
	);
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

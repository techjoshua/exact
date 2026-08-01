import type {
	ComponentResumptionActivation,
	ExactComponentContinuationContract
} from '@exactjs/core';

import type { ExactEndpointRoutes } from './types.js';
import { hasOnlyKeys } from './validation.js';

/** Validates a serialized continuation contract map. */
export function isContinuationMap(
	value: unknown
): value is Record<string, ExactComponentContinuationContract> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	return Object.values(value as Record<string, unknown>).every(isContinuation);
}

/** Validates ordered SSR activations before they can affect component construction. */
export function isComponentResumptions(value: unknown): value is ComponentResumptionActivation[] {
	return (
		Array.isArray(value) &&
		value.every((item) => {
			if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
			const record = item as Record<string, unknown>;
			return (
				hasOnlyKeys(record, ['componentId', 'values', 'contexts', 'settledContinuations']) &&
				typeof record.componentId === 'string' &&
				isRecord(record.values) &&
				Object.keys(record.values).every(safeResumptionPath) &&
				isRecord(record.contexts) &&
				Object.keys(record.contexts).every(safeContextName) &&
				isStringList(record.settledContinuations)
			);
		})
	);
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

function isContinuation(value: unknown): value is ExactComponentContinuationContract {
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
		isContinuationDependencies(record.dependencies) &&
		isStatePathList(record.stateReads) &&
		isStatePathList(record.stateWrites) &&
		isStringList(record.publicContexts) &&
		isStringList(record.serverContexts) &&
		record.serverContexts.length === 0 &&
		isStringList(record.contextWrites) &&
		(record.serverContextWrites === undefined || isStringList(record.serverContextWrites)) &&
		(record.invocation === undefined || isContinuationInvocation(record.invocation)) &&
		isStringList(record.boundaries)
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

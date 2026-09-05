import type { ComponentResumptionActivation } from '@exactjs/core';
import type { ExactServerExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import {
	readReactiveOwnPropertyInto,
	type ReactiveOwnPropertyReadCell
} from '@exactjs/reactive/framework/indexed-objects';

/** One compiler-indexed value in a compact resumption tuple. */
export type IndexedResumptionEntry = readonly [index: number, value: unknown];

/** Final compact request-owned representation published across the hydration boundary. */
export type SsrSerializedResumption = readonly [
	componentId: string,
	values?: readonly IndexedResumptionEntry[],
	contexts?: readonly IndexedResumptionEntry[],
	settledContinuations?: readonly string[]
];

/** Request-owned mutable form used while optional tuple fields are published. */
export type MutableSerializedResumption = [
	componentId: string,
	values?: readonly IndexedResumptionEntry[],
	contexts?: readonly IndexedResumptionEntry[],
	settledContinuations?: readonly string[]
];

/** Compiler-owned field order used only to project an observed public activation. */
export type SsrResumptionLayout = Readonly<{
	statePaths: readonly string[];
	contexts: readonly string[];
}>;

/** Cached compiler-owned layout used to capture and project one component's state. */
export type SsrResumptionSchema = Readonly<{
	layout: SsrResumptionLayout;
	state: readonly Readonly<{
		index: number;
		segments: readonly string[];
		propSegments?: readonly string[];
		defaultValue?: string | number | boolean | null;
		hasDefault?: boolean;
	}>[];
	contexts: readonly string[];
	continuations: ReadonlySet<string>;
}>;

const resumptionSchemas = new WeakMap<object, SsrResumptionSchema>();
/** Shared immutable empty indexed field collection. */
export const emptyIndexedEntries = Object.freeze([]) as readonly IndexedResumptionEntry[];
/** Shared immutable empty named context collection. */
export const emptyContextValues = Object.freeze({}) as Readonly<Record<string, never>>;
/** Shared immutable empty settled-continuation collection. */
export const emptyContinuationIds = Object.freeze([]) as readonly string[];

/** Captures compiler-selected state in deterministic indexed construction order. */
export function captureStateEntries(
	rootInput: boolean,
	state: unknown,
	props: unknown,
	schema: SsrResumptionSchema,
	publishedRootProps: Readonly<Record<string, unknown>> | undefined,
	cell: ReactiveOwnPropertyReadCell
): IndexedResumptionEntry[] {
	return captureStateEntriesWithRootReads(
		rootInput,
		state,
		props,
		schema,
		publishedRootProps,
		cell,
		false
	);
}

/** Captures state from compiler-owned direct-executor storage without generic top-level reads. */
export function captureDirectStateEntries(
	rootInput: boolean,
	state: Record<string, unknown>,
	props: Record<string, unknown>,
	schema: SsrResumptionSchema,
	publishedRootProps: Readonly<Record<string, unknown>> | undefined,
	cell: ReactiveOwnPropertyReadCell
): IndexedResumptionEntry[] {
	return captureStateEntriesWithRootReads(
		rootInput,
		state,
		props,
		schema,
		publishedRootProps,
		cell,
		true
	);
}

function captureStateEntriesWithRootReads(
	rootInput: boolean,
	state: unknown,
	props: unknown,
	schema: SsrResumptionSchema,
	publishedRootProps: Readonly<Record<string, unknown>> | undefined,
	cell: ReactiveOwnPropertyReadCell,
	directRoots: boolean
): IndexedResumptionEntry[] {
	const entries: IndexedResumptionEntry[] = [];
	try {
		for (const field of schema.state) {
			if (!readPath(state, field.segments, cell, directRoots) || cell.value === undefined) continue;
			const stateValue = cell.value;
			if (field.hasDefault && Object.is(stateValue, field.defaultValue)) continue;
			if (field.propSegments) {
				if (!readPath(props, field.propSegments, cell, directRoots)) {
					entries.push([field.index, stateValue]);
					continue;
				}
				const localValue = cell.value;
				if (Object.is(stateValue, localValue)) {
					if (!rootInput) continue;
					if (
						publishedRootProps &&
						readPath(publishedRootProps, field.propSegments, cell, directRoots) &&
						Object.is(localValue, cell.value)
					)
						continue;
				}
			}
			entries.push([field.index, stateValue]);
		}
	} finally {
		cell.value = undefined;
	}
	return entries;
}

/** Converts named context values into compiler-indexed entries. */
export function captureContextEntries(
	values: Record<string, unknown>,
	fields: readonly string[]
): IndexedResumptionEntry[] {
	const entries: IndexedResumptionEntry[] = [];
	for (let index = 0; index < fields.length; index++) {
		const field = fields[index]!;
		if (Object.prototype.hasOwnProperty.call(values, field)) entries.push([index, values[field]]);
	}
	return entries;
}

/** Publishes optional tuple fields without allocating an intermediate record. */
export function publishTuple(
	record: MutableSerializedResumption,
	values: readonly IndexedResumptionEntry[],
	contexts: readonly IndexedResumptionEntry[],
	settled: readonly string[]
): void {
	record.length = 1;
	if (values.length || contexts.length || settled.length) record[1] = values;
	if (contexts.length || settled.length) record[2] = contexts;
	if (settled.length) record[3] = settled;
}

/** Projects compact capture into the public observation shape only when requested. */
export function projectActivation(
	record: SsrSerializedResumption,
	schema: SsrResumptionSchema
): ComponentResumptionActivation {
	return {
		componentId: record[0],
		values: projectEntries(record[1], schema.layout.statePaths),
		contexts: projectEntries(record[2], schema.layout.contexts),
		settledContinuations: record[3] ?? []
	};
}

function projectEntries(
	entries: readonly IndexedResumptionEntry[] | undefined,
	fields: readonly string[]
): Readonly<Record<string, unknown>> {
	const output: Record<string, unknown> = {};
	for (const [index, value] of entries ?? []) output[fields[index]!] = value;
	return output;
}

/** Reads one own-property state path without invoking accessors. */
function readPath(
	value: unknown,
	segments: readonly string[],
	cell: ReactiveOwnPropertyReadCell,
	directRoot = false
): boolean {
	let cursor = value;
	let index = 0;
	if (directRoot) {
		const segment = segments[0];
		if (!segment || !safeSegment(segment) || !cursor || typeof cursor !== 'object') return false;
		cell.value = (cursor as Record<string, unknown>)[segment];
		cursor = cell.value;
		index = 1;
	}
	for (; index < segments.length; index++) {
		const segment = segments[index]!;
		if (!safeSegment(segment) || !cursor || typeof cursor !== 'object') return false;
		if (!readReactiveOwnPropertyInto(cursor, segment, cell)) return false;
		cursor = cell.value;
	}
	cell.value = cursor;
	return true;
}

/** Returns the immutable schema cached for one compiler-owned contract. */
export function resumptionSchema(
	contract: ExactServerExecutableComponentContract
): SsrResumptionSchema {
	const key = contract as object;
	const cached = resumptionSchemas.get(key);
	if (cached) return cached;
	const resumption = contract.resumption!;
	const inputs = new Map(resumption.stateInputs);
	const defaults = new Map(resumption.stateDefaults ?? []);
	const schema: SsrResumptionSchema = {
		layout: { statePaths: resumption.statePaths, contexts: resumption.contexts },
		state: resumption.statePaths.map((path, index) => {
			const propPath = inputs.get(path);
			const hasDefault = defaults.has(path);
			return {
				index,
				segments: path.split('.'),
				...(propPath ? { propSegments: propPath.split('.') } : {}),
				...(hasDefault ? { defaultValue: defaults.get(path), hasDefault: true } : {})
			};
		}),
		contexts: resumption.contexts,
		continuations: new Set(contract.continuations.map((continuation) => continuation.id))
	};
	resumptionSchemas.set(key, schema);
	return schema;
}

/** Rejects prototype-bearing path segments while inspecting component state. */
function safeSegment(segment: string): boolean {
	return (
		segment.length > 0 &&
		segment !== '__proto__' &&
		segment !== 'prototype' &&
		segment !== 'constructor'
	);
}

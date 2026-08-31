import {
	componentContinuationContextValues,
	settledComponentContinuationIds,
	type AnyComponentInstance,
	type ComponentResumptionActivation
} from '@exactjs/core';
import {
	exactComponentIdentity,
	readPreparedExactServerExecutableComponentContract,
	type ExactServerExecutableComponentContract
} from '@exactjs/core/framework/component-contracts';
import {
	serverComponentContinuationContextValuesForHost,
	settledServerComponentContinuationIdsForHost
} from '@exactjs/core/framework/server-component-execution';
import {
	readReactiveOwnPropertyInto,
	type ReactiveOwnPropertyReadCell
} from '@exactjs/reactive/framework/indexed-objects';
import type { RenderToStringOptions } from './types.js';

type IndexedResumptionEntry = readonly [index: number, value: unknown];

/** Final compact request-owned representation published across the hydration boundary. */
export type SsrSerializedResumption = readonly [
	componentId: string,
	values?: readonly IndexedResumptionEntry[],
	contexts?: readonly IndexedResumptionEntry[],
	settledContinuations?: readonly string[]
];

type MutableSerializedResumption = [
	componentId: string,
	values?: IndexedResumptionEntry[],
	contexts?: IndexedResumptionEntry[],
	settledContinuations?: string[]
];

/** Compiler-owned field order used only to project an observed public activation. */
export type SsrResumptionLayout = Readonly<{
	statePaths: readonly string[];
	contexts: readonly string[];
}>;

type SsrResumptionSchema = Readonly<{
	layout: SsrResumptionLayout;
	state: readonly Readonly<{
		index: number;
		segments: readonly string[];
		propSegments?: readonly string[];
	}>[];
	contexts: readonly string[];
	continuations: ReadonlySet<string>;
}>;

/** Request-local capture consumed directly by synchronous component execution. */
export type SsrResumptionCapture = Readonly<{
	checkpoint(): number;
	rollback(checkpoint: number): void;
	reserveDirect(
		componentId: string,
		contract: ExactServerExecutableComponentContract
	): number | undefined;
	publishDirect(
		token: number,
		host: object,
		state: Record<string, unknown>,
		props: Record<string, unknown>
	): void;
	serializedRecords(): readonly SsrSerializedResumption[];
	activations(): readonly ComponentResumptionActivation[];
}>;

const resumptionSchemas = new WeakMap<object, SsrResumptionSchema>();
const emptyContextValues = Object.freeze({}) as Readonly<Record<string, never>>;
const emptyContinuationIds = Object.freeze([]) as readonly string[];

/** Captures compiler-selected state directly in deterministic indexed construction order. */
export function createSsrResumptionCapture(
	options: RenderToStringOptions,
	publishedRootProps?: Readonly<Record<string, unknown>>,
	rootComponentId?: string
): {
	options: RenderToStringOptions;
	serializedRecords(): readonly SsrSerializedResumption[];
	activations(): readonly ComponentResumptionActivation[];
} {
	const records: MutableSerializedResumption[] = [];
	const schemas: SsrResumptionSchema[] = [];
	const recordsByInstance = new WeakMap<AnyComponentInstance, number>();
	const rootInputTokens = new Set<number>();
	const pathReadCell: ReactiveOwnPropertyReadCell = { value: undefined };
	let rootInputClaimed = false;
	let projectedActivations: readonly ComponentResumptionActivation[] | undefined;

	const reserve = (
		componentId: string,
		contract: ExactServerExecutableComponentContract
	): number | undefined => {
		if (!contract.resumption) return undefined;
		const schema = resumptionSchema(contract);
		const token = records.length;
		records.push([componentId]);
		schemas.push(schema);
		if (!rootInputClaimed && componentId === rootComponentId) {
			rootInputTokens.add(token);
			rootInputClaimed = true;
		}
		projectedActivations = undefined;
		return token;
	};

	const publish = (
		token: number,
		state: unknown,
		props: unknown,
		contexts: Record<string, unknown>,
		settledContinuations: readonly string[]
	): void => {
		const record = records[token];
		const schema = schemas[token];
		if (!record || !schema) return;
		const values = captureStateEntries(
			rootInputTokens.has(token),
			state,
			props,
			schema,
			publishedRootProps,
			pathReadCell
		);
		const indexedContexts = captureContextEntries(contexts, schema.contexts);
		const settled = settledContinuations.filter((id) => schema.continuations.has(id));
		publishTuple(record, values, indexedContexts, settled);
		projectedActivations = undefined;
	};

	const capture: SsrResumptionCapture = {
		checkpoint: () => records.length,
		rollback(checkpoint) {
			records.splice(checkpoint);
			schemas.splice(checkpoint);
			for (const token of rootInputTokens) if (token >= checkpoint) rootInputTokens.delete(token);
			rootInputClaimed = rootInputTokens.size > 0;
			projectedActivations = undefined;
		},
		reserveDirect(componentId, contract) {
			return reserve(componentId, contract);
		},
		publishDirect(token, host, state, props) {
			const schema = schemas[token];
			if (!schema) return;
			publish(
				token,
				state,
				props,
				schema.contexts.length
					? serverComponentContinuationContextValuesForHost(host, schema.contexts)
					: emptyContextValues,
				schema.continuations.size
					? settledServerComponentContinuationIdsForHost(host)
					: emptyContinuationIds
			);
		},
		serializedRecords: () => records,
		activations() {
			return (projectedActivations ??= records.map((record, index) =>
				projectActivation(record, schemas[index]!)
			));
		}
	};

	return {
		options: {
			...options,
			resumptionCapture: capture,
			allowIndependentComponentObservation:
				!options.onComponentCreated &&
				!options.onComponentRendered &&
				!options.onDirectComponentCreated &&
				!options.onDirectComponentRendered,
			onComponentCreated(instance) {
				const contract = readPreparedExactServerExecutableComponentContract(instance.type);
				const token = reserve(exactComponentIdentity(instance.type), contract);
				if (token !== undefined) recordsByInstance.set(instance, token);
				options.onComponentCreated?.(instance);
			},
			onComponentRendered(instance) {
				const token = recordsByInstance.get(instance);
				if (token !== undefined) {
					const schema = schemas[token];
					if (schema)
						publish(
							token,
							instance.state,
							instance.props,
							schema.contexts.length
								? componentContinuationContextValues(instance, schema.contexts)
								: emptyContextValues,
							schema.continuations.size
								? settledComponentContinuationIds(instance)
								: emptyContinuationIds
						);
				}
				options.onComponentRendered?.(instance);
			},
			onComponentAttemptCheckpoint: () => [
				capture.checkpoint(),
				options.onComponentAttemptCheckpoint?.()
			],
			onComponentAttemptRollback(checkpoint) {
				if (Array.isArray(checkpoint) && typeof checkpoint[0] === 'number') {
					capture.rollback(checkpoint[0]);
					options.onComponentAttemptRollback?.(checkpoint[1]);
				}
			}
		},
		serializedRecords: capture.serializedRecords,
		activations: capture.activations
	};
}

function captureStateEntries(
	rootInput: boolean,
	state: unknown,
	props: unknown,
	schema: SsrResumptionSchema,
	publishedRootProps: Readonly<Record<string, unknown>> | undefined,
	cell: ReactiveOwnPropertyReadCell
): IndexedResumptionEntry[] {
	const entries: IndexedResumptionEntry[] = [];
	try {
		for (const field of schema.state) {
			if (!readPath(state, field.segments, cell) || cell.value === undefined) continue;
			const stateValue = cell.value;
			if (rootInput && publishedRootProps && field.propSegments) {
				if (!readPath(props, field.propSegments, cell)) {
					entries.push([field.index, stateValue]);
					continue;
				}
				const localValue = cell.value;
				if (
					readPath(publishedRootProps, field.propSegments, cell) &&
					Object.is(stateValue, localValue) &&
					Object.is(localValue, cell.value)
				)
					continue;
			}
			entries.push([field.index, stateValue]);
		}
	} finally {
		cell.value = undefined;
	}
	return entries;
}

function captureContextEntries(
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

function publishTuple(
	record: MutableSerializedResumption,
	values: IndexedResumptionEntry[],
	contexts: IndexedResumptionEntry[],
	settled: string[]
): void {
	record.length = 1;
	if (values.length || contexts.length || settled.length) record[1] = values;
	if (contexts.length || settled.length) record[2] = contexts;
	if (settled.length) record[3] = settled;
}

function projectActivation(
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
	cell: ReactiveOwnPropertyReadCell
): boolean {
	let cursor = value;
	for (const segment of segments) {
		if (
			!safeSegment(segment) ||
			!cursor ||
			typeof cursor !== 'object' ||
			!readReactiveOwnPropertyInto(cursor, segment, cell)
		)
			return false;
		cursor = cell.value;
	}
	cell.value = cursor;
	return true;
}

function resumptionSchema(contract: ExactServerExecutableComponentContract): SsrResumptionSchema {
	const key = contract as object;
	const cached = resumptionSchemas.get(key);
	if (cached) return cached;
	const resumption = contract.resumption!;
	const inputs = new Map(resumption.stateInputs);
	const schema: SsrResumptionSchema = {
		layout: { statePaths: resumption.statePaths, contexts: resumption.contexts },
		state: resumption.statePaths.map((path, index) => {
			const propPath = inputs.get(path);
			return {
				index,
				segments: path.split('.'),
				...(propPath ? { propSegments: propPath.split('.') } : {})
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

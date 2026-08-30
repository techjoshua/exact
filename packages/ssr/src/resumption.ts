import {
	type AnyComponentInstance,
	componentContinuationContextValues,
	settledComponentContinuationIds,
	type ComponentResumptionActivation
} from '@exactjs/core';
import {
	exactComponentIdentity,
	readPreparedExactServerExecutableComponentContract
} from '@exactjs/core/framework/component-contracts';
import {
	serverComponentContinuationContextValuesForHost,
	settledServerComponentContinuationIdsForHost
} from '@exactjs/core/framework/server-component-execution';
import type { RenderToStringOptions } from './types.js';
import type { DirectSsrComponentSnapshot } from './types.js';
import { readReactiveOwnProperty } from '@exactjs/reactive/framework/indexed-objects';

type MutableResumption = {
	componentId: string;
	values: Record<string, unknown>;
	contexts: Record<string, unknown>;
	settledContinuations: string[];
};

/** Compiler-owned field order used only to compact the serialized hydration record. */
export type SsrResumptionLayout = Readonly<{
	statePaths: readonly string[];
	contexts: readonly string[];
}>;

type SsrResumptionSchema = Readonly<{
	layout: SsrResumptionLayout;
	state: readonly Readonly<{
		path: string;
		segments: readonly string[];
		propSegments?: readonly string[];
	}>[];
	contexts: readonly string[];
	continuations: ReadonlySet<string>;
}>;

const resumptionSchemas = new WeakMap<object, SsrResumptionSchema>();

/** Captures compiler-selected state and settled work in deterministic construction order. */
export function createSsrResumptionCapture(
	options: RenderToStringOptions,
	publishedRootProps?: Readonly<Record<string, unknown>>,
	rootComponentId?: string
): {
	options: RenderToStringOptions;
	records(): readonly ComponentResumptionActivation[];
	layouts(): ReadonlyMap<string, SsrResumptionLayout>;
} {
	const records: MutableResumption[] = [];
	const layouts = new Map<string, SsrResumptionLayout>();
	const recordsByInstance = new WeakMap<AnyComponentInstance, MutableResumption>();
	const recordsByDirectFrame = new WeakMap<DirectSsrComponentSnapshot, MutableResumption>();
	const rootInputRecords = new WeakSet<MutableResumption>();
	let rootInputClaimed = false;
	const reserveDirect = (snapshot: DirectSsrComponentSnapshot): void => {
		const resumption = snapshot.contract.resumption;
		if (!resumption) return;
		const schema = resumptionSchema(snapshot.contract);
		const record: MutableResumption = {
			componentId: snapshot.componentId,
			values: {},
			contexts: {},
			settledContinuations: []
		};
		if (!rootInputClaimed && snapshot.componentId === rootComponentId) {
			rootInputRecords.add(record);
			rootInputClaimed = true;
		}
		if (!layouts.has(snapshot.componentId)) layouts.set(snapshot.componentId, schema.layout);
		recordsByDirectFrame.set(snapshot, record);
		records.push(record);
	};
	const captureDirect = (snapshot: DirectSsrComponentSnapshot): void => {
		const resumption = snapshot.contract.resumption;
		const record = recordsByDirectFrame.get(snapshot);
		if (!resumption || !record) return;
		const schema = resumptionSchema(snapshot.contract);
		captureStateValues(
			record,
			rootInputRecords.has(record),
			snapshot.state,
			snapshot.props,
			schema,
			publishedRootProps
		);
		record.contexts = serverComponentContinuationContextValuesForHost(
			snapshot.host,
			schema.contexts
		);
		record.settledContinuations = settledServerComponentContinuationIdsForHost(
			snapshot.host
		).filter((id) => schema.continuations.has(id));
	};
	return {
		options: {
			...options,
			allowIndependentComponentObservation:
				!options.onComponentCreated &&
				!options.onComponentRendered &&
				!options.onDirectComponentCreated &&
				!options.onDirectComponentRendered,
			onDirectComponentCreated(snapshot) {
				reserveDirect(snapshot);
				options.onDirectComponentCreated?.(snapshot);
			},
			onDirectComponentRendered(snapshot) {
				captureDirect(snapshot);
				options.onDirectComponentRendered?.(snapshot);
			},
			onComponentAttemptCheckpoint: () => records.length,
			onComponentAttemptRollback(checkpoint) {
				if (typeof checkpoint === 'number') records.splice(checkpoint);
			},
			onComponentCreated(instance) {
				const contract = readPreparedExactServerExecutableComponentContract(instance.type);
				if (contract.resumption) {
					const schema = resumptionSchema(contract);
					const componentId = exactComponentIdentity(instance.type);
					if (!layouts.has(componentId)) layouts.set(componentId, schema.layout);
					const record: MutableResumption = {
						componentId,
						values: {},
						contexts: {},
						settledContinuations: []
					};
					if (!rootInputClaimed && exactComponentIdentity(instance.type) === rootComponentId) {
						rootInputRecords.add(record);
						rootInputClaimed = true;
					}
					records.push(record);
					recordsByInstance.set(instance, record);
				}
				options.onComponentCreated?.(instance);
			},
			onComponentRendered(instance) {
				const record = recordsByInstance.get(instance);
				const contract = readPreparedExactServerExecutableComponentContract(instance.type);
				if (record && contract.resumption) {
					const schema = resumptionSchema(contract);
					captureStateValues(
						record,
						rootInputRecords.has(record),
						instance.state,
						instance.props,
						schema,
						publishedRootProps
					);
					record.contexts = componentContinuationContextValues(instance, schema.contexts);
					record.settledContinuations = settledComponentContinuationIds(instance).filter((id) =>
						schema.continuations.has(id)
					);
				}
				options.onComponentRendered?.(instance);
			}
		},
		records: () => records,
		layouts: () => layouts
	};
}

function captureStateValues(
	record: MutableResumption,
	rootInput: boolean,
	state: unknown,
	props: unknown,
	schema: SsrResumptionSchema,
	publishedRootProps: Readonly<Record<string, unknown>> | undefined
): void {
	for (const field of schema.state) {
		const found = readPath(state, field.segments);
		if (!found.present || found.value === undefined) continue;
		if (rootInput && publishedRootProps && field.propSegments) {
			const local = readPath(props, field.propSegments);
			const published = readPath(publishedRootProps, field.propSegments);
			if (
				local.present &&
				published.present &&
				Object.is(found.value, local.value) &&
				Object.is(local.value, published.value)
			)
				continue;
		}
		record.values[field.path] = found.value;
	}
}

/** Reads one own-property state path without invoking accessors. */
function readPath(
	value: unknown,
	segments: readonly string[]
): { present: true; value: unknown } | { present: false } {
	let cursor = value;
	for (const segment of segments) {
		if (!safeSegment(segment) || !cursor || typeof cursor !== 'object') return { present: false };
		const field = readReactiveOwnProperty(cursor, segment);
		if (!field.present) return field;
		cursor = field.value;
	}
	return { present: true, value: cursor };
}

function resumptionSchema(contract: {
	resumption?: {
		statePaths: readonly string[];
		stateInputs: readonly (readonly [string, string])[];
		contexts: readonly string[];
	};
	continuations: readonly Readonly<{ id: string }>[];
}): SsrResumptionSchema {
	const key = contract as object;
	const cached = resumptionSchemas.get(key);
	if (cached) return cached;
	const resumption = contract.resumption!;
	const inputs = new Map(resumption.stateInputs);
	const schema: SsrResumptionSchema = {
		layout: { statePaths: resumption.statePaths, contexts: resumption.contexts },
		state: resumption.statePaths.map((path) => {
			const propPath = inputs.get(path);
			return {
				path,
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

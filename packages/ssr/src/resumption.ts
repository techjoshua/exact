import {
	type AnyComponentInstance,
	componentContinuationContextValues,
	settledComponentContinuationIds,
	type ComponentResumptionActivation
} from '@exactjs/core';
import {
	exactComponentIdentity,
	readPreparedExactCompiledComponentContract
} from '@exactjs/core/framework/component-contracts';
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

/** Captures compiler-selected state and settled work in deterministic construction order. */
export function createSsrResumptionCapture(options: RenderToStringOptions): {
	options: RenderToStringOptions;
	records(): readonly ComponentResumptionActivation[];
	layouts(): ReadonlyMap<string, SsrResumptionLayout>;
} {
	const records: MutableResumption[] = [];
	const layouts = new Map<string, SsrResumptionLayout>();
	const recordsByInstance = new WeakMap<AnyComponentInstance, MutableResumption>();
	const recordsByDirectFrame = new WeakMap<DirectSsrComponentSnapshot, MutableResumption>();
	const reserveDirect = (snapshot: DirectSsrComponentSnapshot): void => {
		const resumption = snapshot.contract.resumption;
		if (!resumption) return;
		const record: MutableResumption = {
			componentId: snapshot.componentId,
			values: {},
			contexts: {},
			settledContinuations: []
		};
		layouts.set(snapshot.componentId, {
			statePaths: resumption.statePaths,
			contexts: resumption.contexts
		});
		recordsByDirectFrame.set(snapshot, record);
		records.push(record);
	};
	const captureDirect = (snapshot: DirectSsrComponentSnapshot): void => {
		const resumption = snapshot.contract.resumption;
		const record = recordsByDirectFrame.get(snapshot);
		if (!resumption || !record) return;
		for (const path of resumption.statePaths) {
			const found = readPath(snapshot.state, path);
			if (found.present && found.value !== undefined) record.values[path] = found.value;
		}
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
				const contract = readPreparedExactCompiledComponentContract(instance.type);
				if (contract.resumption) {
					layouts.set(exactComponentIdentity(instance.type), {
						statePaths: contract.resumption.statePaths,
						contexts: contract.resumption.contexts
					});
					const record: MutableResumption = {
						componentId: exactComponentIdentity(instance.type),
						values: {},
						contexts: {},
						settledContinuations: []
					};
					records.push(record);
					recordsByInstance.set(instance, record);
				}
				options.onComponentCreated?.(instance);
			},
			onComponentRendered(instance) {
				const record = recordsByInstance.get(instance);
				const contract = readPreparedExactCompiledComponentContract(instance.type);
				if (record && contract.resumption) {
					for (const path of contract.resumption.statePaths) {
						const found = readPath(instance.state, path);
						if (found.present && found.value !== undefined) record.values[path] = found.value;
					}
					record.contexts = componentContinuationContextValues(
						instance,
						contract.resumption.contexts
					);
					const allowed = new Set(contract.continuations.map((continuation) => continuation.id));
					record.settledContinuations = settledComponentContinuationIds(instance).filter((id) =>
						allowed.has(id)
					);
				}
				options.onComponentRendered?.(instance);
			}
		},
		records: () => records,
		layouts: () => layouts
	};
}

/** Reads one own-property state path without invoking accessors. */
function readPath(
	value: unknown,
	path: string
): { present: true; value: unknown } | { present: false } {
	let cursor = value;
	for (const segment of path.split('.')) {
		if (!safeSegment(segment) || !cursor || typeof cursor !== 'object') return { present: false };
		const field = readReactiveOwnProperty(cursor, segment);
		if (!field.present) return field;
		cursor = field.value;
	}
	return { present: true, value: cursor };
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

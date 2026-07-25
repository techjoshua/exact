import {
	readExactComponentContract,
	settledComponentContinuationIds,
	type ComponentInstance,
	type ComponentResumptionActivation
} from '@exactjs/core';
import type { RenderToStringOptions } from './types.js';

type MutableResumption = {
	componentId: string;
	values: Record<string, unknown>;
	settledContinuations: string[];
};

/** Captures compiler-selected state and settled work in deterministic construction order. */
export function createSsrResumptionCapture(options: RenderToStringOptions): {
	options: RenderToStringOptions;
	records(): readonly ComponentResumptionActivation[];
} {
	const records: MutableResumption[] = [];
	const recordsByInstance = new WeakMap<ComponentInstance<any>, MutableResumption>();
	return {
		options: {
			...options,
			onComponentCreated(instance) {
				const contract = readExactComponentContract(instance.type);
				if (contract?.resumption) {
					const record: MutableResumption = {
						componentId: contract.id,
						values: {},
						settledContinuations: []
					};
					records.push(record);
					recordsByInstance.set(instance, record);
				}
				options.onComponentCreated?.(instance);
			},
			onComponentRendered(instance) {
				const record = recordsByInstance.get(instance);
				const contract = readExactComponentContract(instance.type);
				if (record && contract?.resumption) {
					for (const path of contract.resumption.statePaths) {
						const found = readPath(instance.state, path);
						if (found.present && found.value !== undefined) record.values[path] = found.value;
					}
					const allowed = new Set(contract.continuations.map((continuation) => continuation.id));
					record.settledContinuations = settledComponentContinuationIds(instance).filter((id) =>
						allowed.has(id)
					);
				}
				options.onComponentRendered?.(instance);
			}
		},
		records: () => records
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
		const descriptor = Object.getOwnPropertyDescriptor(cursor, segment);
		if (!descriptor || !('value' in descriptor)) return { present: false };
		cursor = descriptor.value;
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

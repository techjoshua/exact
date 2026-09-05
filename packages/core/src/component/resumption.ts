import type { Reactive } from '@exactjs/reactive/framework/runtime';
import type { ComponentResumptionSource } from './contracts.js';

type IndexedResumptionField = readonly [field: number | string, value: unknown];

/** Applies compiler-selected SSR state paths without replacing client-local setup state. */
export function applyComponentResumption(
	state: Reactive<Record<string, unknown>>,
	resumption: ComponentResumptionSource
): void {
	const values = 'componentId' in resumption ? resumption.values : (resumption[1] ?? []);
	if (Array.isArray(values)) {
		for (const [field, value] of values as unknown as readonly IndexedResumptionField[]) {
			if (typeof field !== 'string')
				throw new Error(
					`eXact indexed resumption was not prepared for ${'componentId' in resumption ? resumption.componentId : resumption[0]}`
				);
			writePath(state, field, value);
		}
		return;
	}
	for (const [path, value] of Object.entries(values)) writePath(state, path, value);
}

/** Materializes one validated dotted state path into the live reactive state object. */
function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
	const segments = path.split('.');
	if (!segments.length || !segments.every(safeSegment)) {
		throw new Error(`Malformed eXact component resumption state path ${path}`);
	}
	let cursor = target;
	for (const segment of segments.slice(0, -1)) {
		const current = cursor[segment];
		if (current && typeof current === 'object' && !Array.isArray(current)) {
			cursor = current as Record<string, unknown>;
		} else {
			const created: Record<string, unknown> = {};
			cursor[segment] = created;
			cursor = created;
		}
	}
	cursor[segments.at(-1)!] = value;
}

/** Rejects prototype-bearing path segments before touching reactive state. */
function safeSegment(segment: string): boolean {
	return (
		segment.length > 0 &&
		segment !== '__proto__' &&
		segment !== 'prototype' &&
		segment !== 'constructor'
	);
}

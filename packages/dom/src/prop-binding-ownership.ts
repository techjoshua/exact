import type { StopHandle } from '@exactjs/core';
import { propBindings } from './state.js';

/** Stops and forgets one reactive property binding before its value is replaced. */
export function clearPropBinding(element: Element, key: string): void {
	const bindings = propBindings.get(element);
	if (!bindings) return;
	const stop = bindings.get(key);
	if (!stop) return;
	stop();
	bindings.delete(key);
}

/** Forgets a binding whose external capability already performed its own cleanup. */
export function releasePropBinding(element: Element, key: string): void {
	const bindings = propBindings.get(element);
	bindings?.delete(key);
	if (bindings && bindings.size === 0) propBindings.delete(element);
}

/** Retains one property cleanup under its owning element and compiler property key. */
export function setPropBinding(element: Element, key: string, stop: StopHandle): void {
	let bindings = propBindings.get(element);
	if (!bindings) {
		bindings = new Map();
		propBindings.set(element, bindings);
	}
	bindings.set(key, stop);
}

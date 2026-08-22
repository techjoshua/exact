import { unwrap } from '@exactjs/core';
import { preserveFocus } from './focus.js';
import { setElementProp } from './props.js';
import type { Mounted } from './types.js';

/** Applies one compiler-closed property group without allocating or enumerating a props record. */
export function applyCompiledProps(
	mounted: Mounted,
	element: Element,
	previousProps: Map<Element, Record<string, unknown>>,
	group: number,
	initialBinding: boolean
): void {
	const state = mounted.renderProgram!;
	let previous = previousProps.get(element);
	if (!previous) {
		previous = {};
		previousProps.set(element, previous);
	}
	const write = () =>
		state.invocation.propertyWriter!(group, (key, source) => {
			const value = unwrap(source);
			if (Object.is(previous[key], value)) return;
			setElementProp(state.root, element, key, value, previous[key], mounted.scope);
			previous[key] = value;
		});
	if (!initialBinding) preserveFocus(state.root, write);
	else write();
}

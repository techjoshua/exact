import { unwrap } from '@exactjs/core';
import { preserveFocus } from './focus.js';
import { clearElementProps, setElementProp } from './props.js';
import type { Mounted } from './types.js';

/** Applies one compiler-closed property group without allocating or enumerating a props record. */
export function applyCompiledProps(
	mounted: Mounted,
	element: Element,
	group: number,
	initialBinding: boolean
): void {
	const state = mounted.renderProgram!;
	const groups = (state.compiledProps ??= []);
	let retained = groups[group];
	if (!retained) {
		retained = { element, values: {} };
		groups[group] = retained;
	}
	const previous = retained.values;
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

/** Releases refs and listeners retained by compact compiler property groups. */
export function releaseCompiledProps(mounted: Mounted): void {
	const state = mounted.renderProgram!;
	if (!state.compiledProps) return;
	for (const retained of state.compiledProps) {
		if (!retained) continue;
		(retained.values.ref as { fulfill(value: unknown): void } | undefined)?.fulfill(undefined);
		clearElementProps(retained.element);
	}
	state.compiledProps = undefined;
}

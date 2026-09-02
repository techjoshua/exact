import { unwrap } from '@exactjs/core';
import type { ExactRenderProgramPropertyOperand } from '@exactjs/core/runtime/render-operations';
import { readIndexedReactiveSlot } from '@exactjs/reactive/framework/runtime';
import { preserveFocus } from './focus.js';
import { clearElementProps, setElementProp } from './props.js';
import type { Mounted } from './types.js';

/** Applies one compiler-closed property group without allocating or enumerating a props record. */
export function applyCompiledProps(
	mounted: Mounted,
	element: Element,
	group: number,
	initialBinding: boolean,
	operands?: readonly ExactRenderProgramPropertyOperand[]
): void {
	const state = mounted.renderProgram!;
	const groups = (state.compiledProps ??= []);
	let retained = groups[group];
	if (!retained) {
		retained = { element, values: {} };
		groups[group] = retained;
	}
	const previous = retained.values;
	const write = () => {
		let spreadValues: Record<string, unknown> | undefined;
		const apply = (key: string, source: unknown) => {
			if (key === '') {
				spreadValues ??= {};
				const spread = unwrap(source);
				if (spread !== null && spread !== undefined && typeof spread === 'object')
					Object.assign(spreadValues, spread);
				return;
			}
			const value = unwrap(source);
			if (spreadValues) {
				spreadValues[key] = value;
				return;
			}
			if (Object.hasOwn(previous, key) && Object.is(previous[key], value)) return;
			setElementProp(state.root, element, key, value, previous[key], mounted.scope);
			previous[key] = value;
		};
		if (operands) {
			const owner = state.invocation.owner as Readonly<{ state: object; props: object }>;
			for (const [key, source, slot] of operands)
				apply(key, readIndexedReactiveSlot(source === 0 ? owner.state : owner.props, slot));
		}
		state.invocation.propertyWriter?.(group, apply);
		if (spreadValues) {
			for (const key of new Set([...Object.keys(previous), ...Object.keys(spreadValues)])) {
				const value = unwrap(spreadValues[key]);
				if (Object.hasOwn(previous, key) && Object.is(previous[key], value)) continue;
				setElementProp(state.root, element, key, value, previous[key], mounted.scope);
				if (key in spreadValues) previous[key] = value;
				else delete previous[key];
			}
		}
	};
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

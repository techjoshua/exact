import type { Component } from '@exactjs/core';

// Keep existing metadata attachment available while withholding every projection intrinsic.
// This fixture isolates the projector's lexical scope from the metadata attachment emitter.
const Object = { label: 'object', assign: globalThis.Object.assign };
const Array = { label: 'array' };

/** Repeated records exercise native projector emission, including nested generic values. */
export function ProjectedRecords(
	this: Component<{}>,
	props: { rows: { id: string; title: string; count: number; detail: { text: string } }[] }
) {
	return () => (
		<div>
			{Object.label}
			{Array.label}
			{props.rows.length}
		</div>
	);
}

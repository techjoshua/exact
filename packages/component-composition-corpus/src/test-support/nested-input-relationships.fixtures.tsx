import type { Component } from '@exactjs/core';

type RecordValue = { value: number };
/** Exposes the parent record for mutation, replacement, removal and disposal checks. */
export let inputRelationshipOwner: Component<{ record: RecordValue | undefined }>;

/** Observes nested fields even while the parent retains the same input record. */
export function NestedProjection(
	this: Component<{ value: number }>,
	props: { record?: RecordValue }
) {
	this.state.value = 0;
	this.state.value = props.record?.value ?? 0;
	return () => <output data-nested-projection>{this.state.value}</output>;
}

/** Observes literal indexed fields without reducing their invalidation to the input object. */
export function LiteralProjection(
	this: Component<{ value: number }>,
	props: { record: RecordValue }
) {
	this.state.value = 0;
	this.state.value = props.record['value'];
	return () => <output data-literal-projection>{this.state.value}</output>;
}
const selectedField = 'value';
/** Observes computed selectors alongside direct and optional member access. */
export function ComputedProjection(
	this: Component<{ value: number }>,
	props: { record: RecordValue }
) {
	this.state.value = 0;
	this.state.value = props.record[selectedField];
	return () => <output data-computed-projection>{this.state.value}</output>;
}

/** Supplies the control using a finalized scalar prop. */
export function RootProjection(this: Component<{ value: number }>, props: { value: number }) {
	this.state.value = 0;
	this.state.value = props.value;
	return () => <output data-root-projection>{this.state.value}</output>;
}

/** Crosses retained nested mutations with ordinary finalized scalar input relationships. */
export function InputRelationships(this: Component<{ record: RecordValue | undefined }>) {
	inputRelationshipOwner = this;
	this.state.record = { value: 1 };
	return () => (
		<main>
			<NestedProjection record={this.state.record} />
			<RootProjection value={this.state.record?.value ?? 0} />
			<LiteralProjection record={this.state.record ?? { value: 0 }} />
			<ComputedProjection record={this.state.record ?? { value: 0 }} />
		</main>
	);
}
/** Creates the shared parent-to-child input relationship fixture. */
export const inputRelationshipRoot = () => <InputRelationships />;

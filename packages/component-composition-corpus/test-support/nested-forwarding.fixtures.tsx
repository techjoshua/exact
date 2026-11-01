import type { Component } from '@exactjs/core';
let owner: Component<{ record: { value: number } }> | undefined;
/** @exact pure */
function format(value: number) {
	return value + 1;
}
function Leaf(this: Component<{ output: number }>, props: { value: number }) {
	this.state.output = format(props.value);
	return () => <output>{this.state.output}</output>;
}
function Middle(props: { record: { value: number } }) {
	return () => <Leaf value={props.record.value} />;
}
/** Compiled ordinary nested receiver witness. */
export function NestedOwner(this: Component<{ record: { value: number } }>) {
	owner = this;
	this.state.record = { value: 1 };
	return () => <Middle record={this.state.record} />;
}
/** Exposes only the owned fixture instance for lifecycle assertions. */
export function nestedOwner() {
	if (!owner) throw new Error('Nested owner has not mounted');
	return owner;
}

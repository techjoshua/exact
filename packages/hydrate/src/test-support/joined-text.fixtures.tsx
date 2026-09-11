import type { Component } from '@exactjs/core';

type Scalar = string | number | boolean | null | undefined;
type TextState = { left: Scalar; right: Scalar };
let instance: Component<TextState> | undefined;

/** Matches the existing JSX scalar text conversion without coercing booleans to words. */
function text(value: Scalar): string {
	return value === null || value === undefined || typeof value === 'boolean' ? '' : String(value);
}

function JoinedText(this: Component<TextState>, props: TextState) {
	instance = this;
	this.state.left = props.left;
	this.state.right = props.right;
	const joined = text(this.state.left) + text(this.state.right);
	return () => <small>{joined}</small>;
}

/** Exercises the proposed single derived scalar through the existing compiler and hydration ABI. */
export const joinedTextRoot = (left: Scalar, right: Scalar) => (
	<JoinedText left={left} right={right} />
);

/** Exposes the durable component state for independent dependency updates in the experiment. */
export function joinedTextInstance(): Component<TextState> {
	if (!instance) throw new Error('Joined text fixture is not mounted');
	return instance;
}

/** Releases the fixture's observation reference after its mounted root has been disposed. */
export function releaseJoinedTextInstance(): void {
	instance = undefined;
}

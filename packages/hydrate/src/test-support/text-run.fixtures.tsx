import type { Component } from '@exactjs/core';

type Scalar = string | number | boolean | null | undefined;
type State = { left: Scalar; right: Scalar };
let instance: Component<State> | undefined;
let reads = 0;

function observe(value: Scalar): Scalar {
	reads++;
	return value;
}

function TextRun(this: Component<State>, props: State) {
	instance = this;
	this.state.left = props.left;
	this.state.right = props.right;
	return () => (
		<section>
			<small>
				{observe(this.state.left)} · {this.state.right}
			</small>
			<b>after</b>
		</section>
	);
}

function EmptyRun(this: Component<State>, props: State) {
	instance = this;
	this.state.left = props.left;
	this.state.right = props.right;
	return () => (
		<small>
			{this.state.left}
			{this.state.right}
		</small>
	);
}

/** Renders arbitrary scalar expressions while retaining separate dependency tracking. */
export const textRunRoot = (left: Scalar, right: Scalar, empty = false) =>
	empty ? <EmptyRun left={left} right={right} /> : <TextRun left={left} right={right} />;

/** Returns the mounted fixture's durable state. */
export function textRunState(): State {
	if (!instance) throw new Error('Text run fixture is not mounted');
	return instance.state;
}

/** Returns the number of authored expression evaluations since the last reset. */
export function textRunReads(): number {
	return reads;
}

/** Clears observation references and counters after the fixture's root is disposed. */
export function releaseTextRun(): void {
	instance = undefined;
	reads = 0;
}

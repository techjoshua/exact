import { peek as snapshot, type Component } from '@exactjs/core';
import * as core from '@exactjs/core';

/** Exercises import identity, lexical snapshot scope and captured helper alias dependencies. */
export function ReactiveProvenanceProbe(this: Component<{ value: number; other: number }>) {
	this.state.value = 1;
	this.state.other = 10;
	const initial = snapshot(() => this.state.value);
	const namespaced = core.peek(() => this.state.value);
	const read = () => this.state.value * 2;
	const first = read;
	const table = { read: first };
	const alias = table['read'] satisfies () => number;
	const doubled = alias();
	function peek(value: number) {
		return value;
	}
	const live = peek(this.state.value);
	const mixed = snapshot(() => this.state.value) + this.state.other;
	const readMixed = () => snapshot(() => this.state.value) + this.state.other;
	const mixedAlias = readMixed;
	const throughHelper = mixedAlias();
	const mappedValues = () =>
		[this.state.value]['map'](
			(value) => value,
			() => document.title
		)[0];
	const mapped = this.reactive(mappedValues);
	const readonly: Readonly<typeof mapped> = mapped;
	const nested = { read: () => snapshot(() => this.state.value), label: this.state.other };
	return () => (
		<section data-provenance>
			<button onClick={() => this.state.value++}>Value</button>
			<button onClick={() => (this.state.other = 20)}>Other</button>
			<output>{`${initial}:${namespaced}:${doubled}:${live}:${mixed}:${nested.label}:${throughHelper}`}</output>
			<output data-callback-map>{readonly['get']()}</output>
		</section>
	);
}

/** Supplies a compiled root for native mounting and strict hydration. */
export function reactiveProvenanceRoot() {
	return <ReactiveProvenanceProbe />;
}

let scalarGetterReads = 0;

/** Counts original getter evaluations in the parent that supplies the scalar input. */
export function scalarPropGetterReads() {
	return scalarGetterReads;
}

/** Reads a changing scalar prop inside a component-owned producer. */
export function ReactiveScalarProp(this: Component<{}>, props: { value: number }) {
	const cell = this.reactive(() => props.value);
	return () => <output>{cell.get()}</output>;
}

/** Delivers the getter result and changes the child prop from parent state. */
export function ReactiveScalarPropParent(this: Component<{ increment: number }>) {
	this.state.increment = 0;
	const input = {
		get value() {
			scalarGetterReads++;
			return 40;
		}
	};
	return () => (
		<section>
			<button onClick={() => this.state.increment++}>Increment</button>
			<ReactiveScalarProp value={input.value + this.state.increment} />
		</section>
	);
}

/** Supplies paired roots for the scalar delivery and hydration regression. */
export function reactiveScalarPropRoot() {
	return <ReactiveScalarPropParent />;
}

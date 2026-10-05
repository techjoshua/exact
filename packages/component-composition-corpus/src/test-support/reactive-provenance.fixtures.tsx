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
	const nested = { read: () => snapshot(() => this.state.value), label: this.state.other };
	return () => (
		<section data-provenance>
			<button onClick={() => this.state.value++}>Value</button>
			<button onClick={() => (this.state.other = 20)}>Other</button>
			<output>{`${initial}:${namespaced}:${doubled}:${live}:${mixed}:${nested.label}:${throughHelper}`}</output>
		</section>
	);
}

/** Supplies a compiled root for native mounting and strict hydration. */
export function reactiveProvenanceRoot() {
	return <ReactiveProvenanceProbe />;
}

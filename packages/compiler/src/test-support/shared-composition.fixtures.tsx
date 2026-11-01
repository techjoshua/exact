import type { Component } from '@exactjs/core';

interface ProbeProps {
	observe(lane: string, value: number): number;
	mounted(): void;
	disposed(): void;
}

function makeReader(input: { count: number }) {
	return () => input.count;
}

/** A container-carried closure reads the durable component's observed state. */
export function SharedComposition(
	this: Component<{ count: number; other: number }>,
	props: ProbeProps
) {
	this.state.count = 1;
	this.state.other = 10;
	const readers = { nested: [makeReader(this.state)] };
	this.onMount(() => props.mounted());
	this.onUnmount(() => props.disposed());
	return () => (
		<main>
			<output data-lane="affected">{props.observe('affected', readers.nested[0]!())}</output>
			<output data-lane="unrelated">{props.observe('unrelated', this.state.other)}</output>
		</main>
	);
}

import type { Component } from '@exactjs/core';

function Label(props: { label: string }) {
	return () => <strong data-role="label">{props.label}</strong>;
}

function Fundamentals(this: Component<{}>, props: { label: string }) {
	return () => (
		<main data-scenario="fundamentals">
			<h1>Composition corpus</h1>
			<Label label={props.label} />
		</main>
	);
}

/** Creates the normative static and prop-forwarding root. */
export const fundamentalsRoot = (label = 'ready') => <Fundamentals label={label} />;

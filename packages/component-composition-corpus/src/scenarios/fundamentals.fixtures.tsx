import type { Component } from '@exactjs/core';

function Label(props: { label: string }) {
	return () => (
		<>
			<strong data-role="label">{props.label}</strong>
			<small data-role="label-suffix">!</small>
		</>
	);
}

function Fundamentals(this: Component<{}>, props: { label: string }) {
	return () => (
		<main data-scenario="fundamentals">
			<h1>Composition corpus</h1>
			<Label label={props.label} />
			<span data-role="after-label">After</span>
		</main>
	);
}

function NestedBoundaryGuard(props: { label: string }) {
	return () => (
		<section>
			<article>
				<div>
					<Label label={props.label} />
					<span data-role="nested-after-label">Nested after</span>
				</div>
			</article>
			<p>{props.label}</p>
		</section>
	);
}

/** Creates the normative static and prop-forwarding root. */
export const fundamentalsRoot = (label = 'ready') => <Fundamentals label={label} />;

/** Keeps nested non-addressable child ranges on their explicit marker path. */
export const nestedBoundaryGuardRoot = (label = 'ready') => <NestedBoundaryGuard label={label} />;

import type { Component } from '@exactjs/core';

let rotationListOwner: Component<{ items: string[] }> | undefined;
let markerBoardOwner: Component<{ marker?: string }> | undefined;
let stableCellsOwner: Component<{ label: string }> | undefined;
let keyedSiblingOwner: Component<{ label: string }> | undefined;

/** Compiler-backed keyed rotation fixture. */
export function RotationList(this: Component<{ items: string[] }>) {
	rotationListOwner = this;
	this.state.items = ['a', 'b', 'c'];
	return () => (
		<ul>
			{this.state.items.map((item) => (
				<li key={item}>{item}</li>
			))}
		</ul>
	);
}

/** Returns the mounted keyed rotation fixture instance. */
export function rotationListInstance() {
	if (!rotationListOwner) throw new Error('RotationList is not mounted');
	return rotationListOwner;
}

/** Compiler-backed static-cell identity fixture with an optional sibling. */
export function MarkerBoard(this: Component<{ marker?: string }>) {
	markerBoardOwner = this;
	this.state.marker = undefined;
	return () => (
		<section>
			{this.state.marker === 'a' ? <i>marker</i> : null}
			<button data-card="a">a</button>
			<button data-card="b">b</button>
		</section>
	);
}

/** Returns the mounted marker-board fixture instance. */
export function markerBoardInstance() {
	if (!markerBoardOwner) throw new Error('MarkerBoard is not mounted');
	return markerBoardOwner;
}

/** Compiler-backed text-cell update fixture. */
export function StableCellsPanel(this: Component<{ label: string }>) {
	stableCellsOwner = this;
	this.state.label = 'Alpha';
	return () => (
		<section>
			<span>{this.state.label}</span>
			<strong>stable</strong>
		</section>
	);
}

/** Returns the mounted stable-cell fixture instance. */
export function stableCellsPanelInstance() {
	if (!stableCellsOwner) throw new Error('StableCellsPanel is not mounted');
	return stableCellsOwner;
}

/** Compiler-backed keyed/unkeyed sibling update fixture. */
export function KeyedSiblingPanel(this: Component<{ label: string }>) {
	keyedSiblingOwner = this;
	this.state.label = 'first';
	return () => (
		<section>
			<h1>Heading</h1>
			<article key="report">{this.state.label}</article>
		</section>
	);
}

/** Returns the mounted keyed-sibling fixture instance. */
export function keyedSiblingPanelInstance() {
	if (!keyedSiblingOwner) throw new Error('KeyedSiblingPanel is not mounted');
	return keyedSiblingOwner;
}

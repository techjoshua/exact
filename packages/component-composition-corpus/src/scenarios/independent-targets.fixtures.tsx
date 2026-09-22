import type { Child, Component } from '@exactjs/core';
/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes enhancement namespace attributes. */
import {
	left,
	right
} from './independent-target-routing.fixtures.js' with { type: 'exact-enhancement' };

function SuppliedRoot(_props: { children?: Child }) {
	return () => <_target />;
}

function IndependentRoots() {
	return () => (
		<section left:root>
			<SuppliedRoot right:root>
				<input />
			</SuppliedRoot>
		</section>
	);
}

function DuplicateRoots() {
	return () => (
		<section>
			<button left:root>one</button>
			<button left:root>two</button>
		</section>
	);
}

/** A contribution boundary cannot override either namespace's explicit root. */
export const independentTargetsRoot = <IndependentRoots left:active right:active />;

/** Duplicate active roots fail before traversal order can select a winner. */
export const duplicateTargetsRoot = <DuplicateRoots left:active />;

/** Exposes the durable empty-root owner for readiness transitions. */
export let emptyTargetOwner: Component<{ visible: boolean }>;
function EmptyTarget(this: Component<{ visible: boolean }>) {
	emptyTargetOwner = this;
	this.state.visible = false;
	return () => (this.state.visible ? <button id="ready">ready</button> : null);
}
function DormantRoots() {
	return () => (
		<section>
			<button id="fallback">fallback</button>
			<EmptyTarget left:root />
		</section>
	);
}
/** An explicitly marked empty child suppresses unrelated intrinsic fallback. */
export const dormantTargetsRoot = <DormantRoots left:active />;

function FallbackRoot() {
	return () => (
		<section>
			<input />
		</section>
	);
}
/** A direct compiler program can be selected without an authored root marker. */
export const fallbackTargetsRoot = <FallbackRoot left:active />;

/** Retains selector state independently of the peer enhancement instances. */
export let retargetOwner: Component<{ first: boolean }>;
function RetargetRoots(this: Component<{ first: boolean }>) {
	retargetOwner = this;
	this.state.first = true;
	return () => (
		<section>
			<button id="first" left:root={this.state.first} right:root />
			<button id="second" left:root={!this.state.first} />
			<input />
		</section>
	);
}
/** One namespace moves while the other retains its selected target and wrapper. */
export const retargetRoot = <RetargetRoots left:active right:active />;

function ProjectionFrame(props: { children?: Child }) {
	return () => <section left:root>{props.children}</section>;
}
/** Caller-owned selectors cannot compete with the receiving component's own root. */
export const projectionTargetRoot = (
	<ProjectionFrame left:active>
		<button left:root>projected</button>
	</ProjectionFrame>
);

function TextFragmentRoot() {
	return () => <>text-only</>;
}
/** Fragment-only component output remains a live enhancement target. */
export const textFragmentRoot = <TextFragmentRoot left:active />;

/** Observes updates to a scalar component's retained text target. */
export let scalarOwner: Component<{ text: string }>;
function ScalarRoot(this: Component<{ text: string }>) {
	this.state.text = 'scalar-only';
	scalarOwner = this;
	return () => this.state.text;
}
/** A scalar output remains a Text target instead of disappearing from fallback. */
export const scalarRoot = <ScalarRoot left:active />;

function EmptyFallbackChild() {
	return () => null;
}
function LaterFallbackChild() {
	return () => <button>later fallback</button>;
}
function EmptyFirstFallback() {
	return () => (
		<>
			<EmptyFallbackChild />
			<LaterFallbackChild />
		</>
	);
}
/** Fallback proceeds to a later root-bearing sibling after an empty component finishes. */
export const emptyFirstFallback = <EmptyFirstFallback left:active />;

/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes the namespace in JSX attributes. */
import type { Component } from '@exactjs/core';
import { UnawareFragment, UnawareTextLeaf } from './unaware-fragment.fixtures.js';
import * as defaultFragment from './default-fragment-routing.fixtures.js' with { type: 'exact-enhancement' };
import * as automatic from './automatic-routing.fixtures.js' with { type: 'exact-enhancement' };

/** Authored fragment configuration exercises lowering together with automatic preparation. */
export const automaticFragmentRoot = (
	<_ automatic:implicit automatic:intrinsicFragment="em">
		authored
	</_>
);

function AutomaticFragmentPage() {
	return () => automaticFragmentRoot;
}

/** Component root exercises public hydration after prepared fragment adoption. */
export const automaticPageRoot = <AutomaticFragmentPage />;

/** Literal markup inside a text host uses ordinary prepared enhancement owners. */
function AutomaticTextPage() {
	return () => <textarea>{automaticFragmentRoot}</textarea>;
}
/** Component-root literal enhancement presentation. */
export const automaticTextHost = <AutomaticTextPage />;

let programOwner: { state: { value: string } };
function TextProgram(this: Component<{ value: string }>) {
	this.state.value = 'first & value';
	programOwner = this;
	return () => <strong title={this.state.value}>{this.state.value}</strong>;
}
export { programOwner };
/** Nested compiled programs serialize their markup without mounting the intrinsic. */
function ProgramTextPage() {
	return () => (
		<textarea>
			<TextProgram />
		</textarea>
	);
}
/** Component-root compiled markup presentation. */
export const programTextHost = <ProgramTextPage />;

function DefaultFragmentPage() {
	return () => (
		<section>
			<UnawareFragment />
			<UnawareFragment automatic:passive />
			<UnawareFragment defaultFragment:label="configured" />
		</section>
	);
}
/** Only the enhanced invocation can materialize a fragment contribution host. */
export const defaultFragmentPage = <DefaultFragmentPage />;

/** Incoming fallback can resolve a nested Text target without treating it as a fragment. */
export const defaultTextLeafPage = <UnawareTextLeaf defaultFragment:label="configured" />;

function DefaultFragmentTextPage() {
	return () => (
		<textarea>
			<UnawareFragment />
			<UnawareFragment defaultFragment:label="configured" />
		</textarea>
	);
}
/** Text-only hosts resolve incoming default enhancements after preparing the unaware component. */
export const defaultFragmentTextPage = <DefaultFragmentTextPage />;

/** Mutually exclusive placement branches can move one supplied child. */
export let placementOwner: Component<{ first: boolean; second: boolean }>;
function ConditionalPlacement(
	this: Component<{ first: boolean; second: boolean }>,
	props: { duplicate?: boolean; children?: import('@exactjs/core').Child }
) {
	placementOwner = this;
	this.state.first = true;
	this.state.second = props.duplicate ?? false;
	return () => (
		<section>
			{this.state.first && <_target />}
			{this.state.second && <_target />}
		</section>
	);
}
/** Dynamic placement checks operate on the final branch snapshot before DOM mutation. */
export function conditionalPlacement(duplicate = false) {
	return (
		<ConditionalPlacement duplicate={duplicate}>
			<PlacementChild />
		</ConditionalPlacement>
	);
}

/** Tracks setup and disposal independently of the receiving component's movable placement. */
export const placementLifetime = { created: 0, disposed: 0 };
function PlacementChild(this: Component<{}>) {
	placementLifetime.created++;
	this.onUnmount(() => placementLifetime.disposed++);
	return () => <button>one target</button>;
}

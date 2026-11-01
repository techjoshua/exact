import type { Component } from '@exactjs/core';
const Object = { keys: 0 };
const __exactElementIdentity = Object.keys;
/** Reads the authored lexical Object binding retained beside compiled hosts. */
export const readLexicalObjectKeys = () => __exactElementIdentity;
let clicks = 0;
/** Reads events delivered through the compiler-generated target. */
export const readIdentityClicks = () => clicks;
/** Resets event delivery between paired mount and hydration checks. */
export const resetIdentityClicks = () => {
	clicks = 0;
};
function IdentityButton(props: { bag: Record<string, unknown> }) {
	return () => (
		<button {...(props.bag as {})} data-testid="identity" onClick={() => clicks++}>
			Go
		</button>
	);
}
function IdentitySelect(props: { bag: Record<string, unknown> }) {
	return () => (
		<select {...(props.bag as {})} data-testid="identity" onChange={() => clicks++}>
			<option>Go</option>
		</select>
	);
}
/** Supplies an opaque bag to the compiler-owned compact event target. */
export const identityButtonRoot = (bag: Record<string, unknown>) => <IdentityButton bag={bag} />;
/** Supplies an opaque bag to the existing generic select lowering path. */
export const identitySelectRoot = (bag: Record<string, unknown>) => <IdentitySelect bag={bag} />;

function IdentitySvg(props: { bag: Record<string, unknown> }) {
	return () => (
		<svg>
			<g {...(props.bag as {})} data-testid="identity" onClick={() => clicks++}>
				Go
			</g>
		</svg>
	);
}
function IdentityMath(props: { bag: Record<string, unknown> }) {
	return () => (
		<math>
			<mi {...(props.bag as {})} data-testid="identity" onClick={() => clicks++}>
				Go
			</mi>
		</math>
	);
}
/** Exercises HTML serialization of an SVG target with an opaque bag. */
export const identitySvgRoot = (bag: Record<string, unknown>) => <IdentitySvg bag={bag} />;
/** Exercises HTML serialization of a MathML target with an opaque bag. */
export const identityMathRoot = (bag: Record<string, unknown>) => <IdentityMath bag={bag} />;

function IdentityFragment(props: { bag: Record<string, unknown> }) {
	return () => (
		<_ {...(props.bag as {})}>
			<button data-testid="identity" onClick={() => clicks++}>
				Go
			</button>
		</_>
	);
}
function IdentityTarget(props: { bag: Record<string, unknown>; children?: unknown }) {
	return () => <_target {...(props.bag as {})} />;
}
function IdentityTargetHost(props: { bag: Record<string, unknown> }) {
	return () => (
		<IdentityTarget bag={props.bag}>
			<button data-testid="identity" onClick={() => clicks++}>
				Go
			</button>
		</IdentityTarget>
	);
}
/** Supplies opaque host contributions through a transparent fragment. */
export const identityFragmentRoot = (bag: Record<string, unknown>) => (
	<IdentityFragment bag={bag} />
);
/** Supplies opaque host contributions through explicit target projection. */
export const identityTargetRoot = (bag: Record<string, unknown>) => (
	<IdentityTargetHost bag={bag} />
);

function EmptyKeysTarget(props: { bag: Record<string, unknown>; children?: unknown }) {
	const Object = { keys: () => [] };
	return () => <_target {...(props.bag as {})} data-shadow={Object.keys().length} />;
}
function EmptyKeysPhysical(props: { bag: Record<string, unknown> }) {
	const Object = { keys: () => [] };
	return () => (
		<button
			{...(props.bag as {})}
			data-shadow={Object.keys().length}
			data-testid="identity"
			onClick={() => clicks++}
		>
			Go
		</button>
	);
}
function EmptyKeysTargetHost(props: { bag: Record<string, unknown> }) {
	return () => (
		<EmptyKeysTarget bag={props.bag}>
			<button data-testid="identity" onClick={() => clicks++}>
				Go
			</button>
		</EmptyKeysTarget>
	);
}
/** Tests a lexical Object.keys function that returns no keys beside compiler-issued physical metadata. */
export const identityEmptyKeysPhysicalRoot = (bag: Record<string, unknown>) => (
	<EmptyKeysPhysical bag={bag} />
);
/** Tests the same lexical binding beside target contribution projection. */
export const identityEmptyKeysTargetRoot = (bag: Record<string, unknown>) => (
	<EmptyKeysTargetHost bag={bag} />
);

function ConditionalIdentity(this: Component<{ count: number }>, props: { first: boolean }) {
	this.state.count = 0;
	const attrs = props.first
		? { onClick: () => this.state.count++, title: 'first' }
		: { title: 'second', onClick: () => (this.state.count += 2) };
	return () => (
		<button {...attrs} data-testid="conditional">
			{this.state.count}
		</button>
	);
}
/** Exercises retained conditional spread handlers through paired output and hydration. */
export const conditionalIdentityRoot = (first: boolean) => <ConditionalIdentity first={first} />;

function IdentityNested(props: { bag: Record<string, unknown> }) {
	return () => (
		<section>
			<button {...(props.bag as {})} onClick={() => clicks++}>
				Go
			</button>
		</section>
	);
}
/** Exercises a replay address on a compact descendant rather than the program root. */
export const identityNestedRoot = (bag: Record<string, unknown>) => <IdentityNested bag={bag} />;

/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes enhancement namespace bindings from JSX attributes. */
import {
	createContext,
	createEnhancementNode,
	createRef,
	type Child,
	type Component,
	type RootLifecycle
} from '@exactjs/core';
import { motion } from './enhancement-routing.fixtures.js' with { type: 'exact-enhancement' };
import { left } from './enhancement-routing-left.fixtures.js' with { type: 'exact-enhancement' };
import { right } from './enhancement-routing-right.fixtures.js' with { type: 'exact-enhancement' };
import { createPortal } from '@exactjs/core';

export const reactiveEnhancementIdentity = './enhancement-routing.fixtures.js#motion';

/** Compiler-backed enhancement wrapper with observable final disposal. */
export function EnhancementWrapper(
	this: Component<{}>,
	props: { children?: Child; className?: string; onUnmount?(): void }
) {
	if (props.onUnmount) this.onUnmount(props.onUnmount);
	return () => <div className={props.className}>{props.children}</div>;
}

export const DirectEnhancementToken = createContext<{ readonly value: string }>(
	'@test/direct-enhancement-provider'
);

/** Compiler-backed direct provider whose context value follows received enhancement props. */
export function DirectEnhancementProvider(
	this: Component<{}>,
	props: { children?: Child; value?: string }
) {
	this.setContext(DirectEnhancementToken, {
		get value() {
			return props.value ?? 'missing';
		}
	});
	return () => <section>{props.children}</section>;
}

/** Compiler-backed direct-provider consumer. */
export function DirectEnhancementConsumer(this: Component<{}>, props: { onSetup?(): void }) {
	props.onSetup?.();
	const value = this.getContext(DirectEnhancementToken);
	return () => <output>{value.value}</output>;
}

export const ReactiveEnhancementToken = createContext<{ readonly value: string }>(
	'@test/reactive-nested-direct-provider'
);

/** Compiler-backed nested provider for reactive enhancement-prop ownership. */
export function ReactiveEnhancementProvider(
	this: Component<{}>,
	props: { children?: Child; value?: string }
) {
	this.setContext(ReactiveEnhancementToken, {
		get value() {
			return props.value ?? 'missing';
		}
	});
	return () => <div>{props.children}</div>;
}

/** Reads the nearest reactive enhancement provider. */
export function ReactiveEnhancementConsumer(this: Component<{}>) {
	const value = this.getContext(ReactiveEnhancementToken);
	return () => <output>{value.value}</output>;
}

let reactiveEnhancementOwner: Component<{ outer: string; inner: string }> | undefined;

/** Compiler-backed owner whose state feeds nested enhancement declarations. */
export function ReactiveEnhancementApp(this: Component<{ outer: string; inner: string }>) {
	reactiveEnhancementOwner = this;
	this.state.outer = 'outer';
	this.state.inner = 'inner';
	return () => (
		<_ {...enhancementAttributes(this.state.outer)}>
			<_ {...enhancementAttributes(this.state.inner)}>
				<ReactiveEnhancementConsumer />
			</_>
		</_>
	);
}

/** Returns the mounted nested-enhancement fixture owner. */
export function getReactiveEnhancementOwner() {
	if (!reactiveEnhancementOwner) throw new Error('ReactiveEnhancementApp is not mounted');
	return reactiveEnhancementOwner;
}

function enhancementAttributes(value: unknown) {
	return {
		__exactEnhancements: createEnhancementNode([
			{ identity: reactiveEnhancementIdentity, props: { value } }
		])
	};
}

/** Transparent enhancement that exposes setup and selected-root observations. */
export function TransparentMotion(
	this: Component<{}>,
	props: { children?: Child; onSetup?(): void; onRoot?(root: RootLifecycle<HTMLElement>): void }
) {
	props.onSetup?.();
	props.onRoot?.(this.refs.root<HTMLElement>());
	return () => props.children;
}

/** Compiler-backed class contribution used for form-binding coverage. */
export function FieldContribution(props: { children?: Child }) {
	return () => <_target className="field">{props.children}</_target>;
}

/** Compiler-backed class contribution used for interaction coverage. */
export function ActionContribution(props: { children?: Child }) {
	return () => <_target className="action">{props.children}</_target>;
}

/** Structural fragment enhancement fixture. */
export function AsideWrapper(props: { children?: Child }) {
	return () => <aside>{props.children}</aside>;
}

const outerContributionToken = createContext<string>('@test/direct-enhancement-outer');
const innerContributionToken = createContext<string>('@test/direct-enhancement-inner');

/** Outer direct target contributor. */
export function OuterContribution(this: Component<{}>, props: { children?: Child }) {
	this.setContext(outerContributionToken, 'outer');
	return () => <_target lang="fr">{props.children}</_target>;
}

/** Inner direct target contributor. */
export function InnerContribution(this: Component<{}>, props: { children?: Child }) {
	this.setContext(innerContributionToken, 'inner');
	return () => <_target className="themed">{props.children}</_target>;
}

const compiledOwnerToken = createContext<string>('@test/compiled-update-enhancement-owner');

/** Direct provider used while a compiled render program owns updates. */
export function CompiledOwnerProvider(this: Component<{}>, props: { children?: Child }) {
	this.setContext(compiledOwnerToken, 'provided');
	return () => <_target className="provided">{props.children}</_target>;
}

const nestedProviderToken = createContext<string>('@test/nested-direct-enhancement-provider');

/** Nestable direct provider whose value incorporates its parent. */
export function NestedDirectProvider(
	this: Component<{}>,
	props: { children?: Child; value?: string }
) {
	const parent = this.hasContext(nestedProviderToken)
		? this.getContext(nestedProviderToken)
		: undefined;
	this.setContext(nestedProviderToken, `${parent ? `${parent}/` : ''}${props.value}`);
	return () => <div>{props.children}</div>;
}

/** Consumer for the nestable direct-provider fixture. */
export function NestedDirectConsumer(this: Component<{}>) {
	const value = this.getContext(nestedProviderToken);
	return () => <output>{value}</output>;
}

type LayeredCallbacks = {
	children?: Child;
	onRef?(name: string, value: unknown): void;
	onEvent?(name: string): void;
};

function callbackRef(props: LayeredCallbacks, name: string) {
	return {
		current: undefined,
		key: createRef<EventTarget>(`layered-${name}`),
		owner: undefined as never,
		fulfill: (value: unknown) => props.onRef?.(name, value)
	};
}

/** Inner ordinary target-contribution component. */
export function LayeredInner(props: LayeredCallbacks) {
	return () => (
		<_target
			title="inner"
			className="inner shared"
			style={{ color: 'blue', paddingTop: '4px' }}
			aria-describedby="inner shared"
			ref={callbackRef(props, 'inner')}
			onClick={() => props.onEvent?.('inner')}
		>
			{props.children}
		</_target>
	);
}

/** Outer ordinary target-contribution component. */
export function LayeredOuter(props: LayeredCallbacks) {
	return () => (
		<section>
			<_target
				title="outer"
				className="outer shared"
				style={{ color: 'red', marginTop: '2px' }}
				aria-describedby="outer shared"
				ref={callbackRef(props, 'outer')}
				onClick={() => props.onEvent?.('outer')}
			>
				<LayeredInner onRef={props.onRef} onEvent={props.onEvent}>
					{props.children}
				</LayeredInner>
			</_target>
		</section>
	);
}

/** Enhancement-invoked surface using ordinary target forwarding. */
export function EnhancementSurface(
	this: Component<{}>,
	props: { children?: Child; tone?: string; onRoot?(root: RootLifecycle<HTMLElement>): void }
) {
	props.onRoot?.(this.refs.root<HTMLElement>());
	return () => (
		<label className="surface">
			<_target className={props.tone} aria-describedby="surface-help">
				{props.children}
			</_target>
			<small id="surface-help">Help</small>
		</label>
	);
}

/** Compiler-backed prop-driven explicit target boundary. */
export function RoutingBoundary(props: { left: boolean }) {
	return () => (
		<_>
			<button id="left" motion:root={props.left}>
				Left
			</button>
			<button id="right" motion:root={!props.left}>
				Right
			</button>
		</_>
	);
}

let routingSelectorOwner: Component<{ left: boolean }> | undefined;

/** Compiler-backed reactive selector-slot boundary. */
export function RoutingSelectorBoundary(this: Component<{ left: boolean }>) {
	routingSelectorOwner = this;
	this.state.left = true;
	return () => (
		<_>
			<button id="left" motion:root={this.state.left} />
			<button id="right" motion:root={!this.state.left} />
		</_>
	);
}

/** Returns the currently mounted selector routing owner. */
export function getRoutingSelectorOwner() {
	if (!routingSelectorOwner) throw new Error('RoutingSelectorBoundary is not mounted');
	return routingSelectorOwner;
}

let routingCardOwner: Component<{ explicit: boolean }> | undefined;

/** Compiler-backed stateful boundary that introduces a target dynamically. */
export function RoutingDynamicCard(this: Component<{ explicit: boolean }>) {
	routingCardOwner = this;
	this.state.explicit = false;
	return () => (
		<section>
			<button id="dynamic" motion:root={this.state.explicit} />
		</section>
	);
}

/** Returns the currently mounted dynamic routing owner. */
export function getRoutingCardOwner() {
	if (!routingCardOwner) throw new Error('RoutingDynamicCard is not mounted');
	return routingCardOwner;
}

/** Enhancement used to verify nearest target declaration precedence. */
export function RoutingToneMotion(props: {
	children?: Child;
	tone?: string;
	onSetup?(tone: string | undefined): void;
}) {
	props.onSetup?.(props.tone);
	return () => <div className={props.tone}>{props.children}</div>;
}

/** Boundary with a nearer explicit enhancement target. */
export function RoutingNearCard() {
	return () => (
		<section>
			<button motion:root motion:tone="near">
				Save
			</button>
		</section>
	);
}

const orderingToken = createContext<string>('enhancement-order', true);

/** Context provider used to establish enhancement setup ordering. */
export function RoutingOrderingProvider(
	this: Component<{}>,
	props: { children?: Child; onSetup?(value: string): void }
) {
	props.onSetup?.('provider');
	this.setContext(orderingToken, 'ready');
	return () => props.children;
}

/** Context consumer used to establish enhancement setup ordering. */
export function RoutingOrderingConsumer(
	this: Component<{}>,
	props: { children?: Child; onSetup?(value: string): void }
) {
	props.onSetup?.(`consumer:${this.getContext(orderingToken)}`);
	return () => props.children;
}

const cycleLeftToken = createContext<string>('enhancement-cycle-left', true);
const cycleRightToken = createContext<string>('enhancement-cycle-right', true);

/** Left side of a statically detectable enhancement context cycle. */
export function RoutingCycleLeft(
	this: Component<{}>,
	props: { children?: Child; onSetup?(): void }
) {
	props.onSetup?.();
	this.setContext(cycleLeftToken, 'left');
	this.getContext(cycleRightToken);
	return () => props.children;
}

/** Right side of a statically detectable enhancement context cycle. */
export function RoutingCycleRight(
	this: Component<{}>,
	props: { children?: Child; onSetup?(): void }
) {
	props.onSetup?.();
	this.setContext(cycleRightToken, 'right');
	this.getContext(cycleLeftToken);
	return () => props.children;
}

/** Boundary with independently selected left and right enhancement targets. */
export function RoutingDualBoundary() {
	return () => (
		<>
			<button id="left" left:root />
			<button id="right" right:root />
		</>
	);
}

/** Compiled implementation catalogued for the left logical target identity. */
export function RoutingLeftShell(props: { children?: Child }) {
	return () => <div className="left-shell">{props.children}</div>;
}

/** Compiled implementation catalogued for the right logical target identity. */
export function RoutingRightShell(props: { children?: Child }) {
	return () => <div className="right-shell">{props.children}</div>;
}

/** Transparent portal enhancement that publishes its selected lifecycle root. */
export function RoutingPortalMotion(
	this: Component<{}>,
	props: { children?: Child; onRoot?(root: RootLifecycle<HTMLElement>): void }
) {
	props.onRoot?.(this.refs.root<HTMLElement>());
	return () => props.children;
}

/** Boundary whose explicit logical target is rendered through a portal. */
export function RoutingPortalCard(props: { portal: Element }) {
	return () => (
		<section>{createPortal(props.portal, <button id="portal-target" motion:root />)}</section>
	);
}

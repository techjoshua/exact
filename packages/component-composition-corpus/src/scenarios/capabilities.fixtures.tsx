import { createContext, createRef, type Component } from '@exactjs/core';

type Item = { id: string; label: string; values: string[] };
type CapabilityState = { items: Item[] };
const corpusContext = createContext<string>('@exactjs/corpus/context');
/** Stable ref key used to verify both mount and hydration fulfillment. */
export const corpusButtonRef = createRef<HTMLButtonElement>('corpus-button');

let mountedCapabilities: Component<CapabilityState> | undefined;
let unmountCount = 0;

function ContextConsumer(this: Component<{}>) {
	const value = this.getContext(corpusContext);
	return () => <output data-role="context">{value}</output>;
}

function ItemLabel(props: { label: string }) {
	return () => <span data-role="item-label">{props.label}</span>;
}

function CapabilityComposition(this: Component<CapabilityState>) {
	mountedCapabilities = this;
	this.state.items = [
		{ id: 'a', label: 'Alpha', values: ['mean', 'p50'] },
		{ id: 'b', label: 'Beta', values: ['mean', 'p50'] }
	];
	this.setContext(corpusContext, 'provided');
	this.onUnmount(() => unmountCount++);
	return () => (
		<section data-scenario="capabilities">
			<ContextConsumer />
			<button ref={this.ref(corpusButtonRef)}>focus</button>
			<ul>
				{this.state.items.map((item) => (
					<li key={item.id} data-id={item.id}>
						<ItemLabel label={item.label} />
						{item.values.map((value) => (
							<small key={value} data-role="nested-value">
								{item.id}:{value}
							</small>
						))}
					</li>
				))}
			</ul>
		</section>
	);
}

function ContextOnly(this: Component<{}>) {
	this.setContext(corpusContext, 'provided');
	return () => (
		<section data-scenario="context-only">
			<ContextConsumer />
		</section>
	);
}

function KeyedOnly(this: Component<CapabilityState>) {
	this.state.items = [
		{ id: 'a', label: 'Alpha', values: [] },
		{ id: 'b', label: 'Beta', values: [] }
	];
	return () => (
		<ul data-scenario="keyed-only">
			{this.state.items.map((item) => (
				<li key={item.id} data-id={item.id}>
					{item.label}
				</li>
			))}
		</ul>
	);
}

function RefLifecycleOnly(this: Component<{}>) {
	this.onUnmount(() => undefined);
	return () => (
		<button data-scenario="ref-only" ref={this.ref(corpusButtonRef)}>
			focus
		</button>
	);
}

/** Compiler-issued capability-composition root. */
export const capabilitiesRoot = <CapabilityComposition />;

/** Compiler-issued context atom root. */
export const contextOnlyRoot = <ContextOnly />;

/** Compiler-issued keyed-list atom root. */
export const keyedOnlyRoot = <KeyedOnly />;

/** Compiler-issued ref and lifecycle atom root. */
export const refLifecycleOnlyRoot = <RefLifecycleOnly />;

/** Reads the mounted capability owner. */
export function capabilitiesOwner(): Component<CapabilityState> {
	if (!mountedCapabilities) throw new Error('Capability scenario is not mounted');
	return mountedCapabilities;
}

/** Reads final-disposal observations for the capability scenario. */
export function capabilityUnmountCount(): number {
	return unmountCount;
}

/** Resets final-disposal observations between tests. */
export function resetCapabilityObservations(): void {
	unmountCount = 0;
}

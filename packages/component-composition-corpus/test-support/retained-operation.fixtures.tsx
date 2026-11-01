import { createRef, type Child, type Component } from '@exactjs/core';
import { render, type RenderOptions } from '@exactjs/dom/root';
/** Ref owned by the supplied button instance throughout sibling changes. */
export const buttonRef = createRef<HTMLButtonElement>('retained operation button');
/** Inspectable supplied button used to distinguish retention from reconstruction. */
export let buttonOwner: Component<{ count: number }>;
/** The retained direct parent of the supplied sibling list. */
export let parentOwner: Component<{}>;
/** Number of actually disposed conditional owners. */
export let spanDisposals = 0;
/** Number of actually disposed button owners. */
export let buttonDisposals = 0;
/** Latest conditional owner, expected fresh after removal and restoration. */
export let spanOwner: Component<{}>;
/** Owns native ref, state and interaction independent of its sibling position. */
export function StableButton(this: Component<{ count: number }>) {
	buttonOwner = this;
	this.onUnmount(() => {
		buttonDisposals++;
	});
	this.state.count = 0;
	return () => (
		<button ref={this.ref(buttonRef)} onClick={() => this.state.count++}>
			{this.state.count}
		</button>
	);
}
/** Owns the lifetime of one removable conditional sibling. */
export function ConditionalSpan(this: Component<{}>) {
	spanOwner = this;
	this.onUnmount(() => {
		spanDisposals++;
	});
	return () => <span>conditional</span>;
}
/** Receives complete supplied operations without inventing lexical update authority. */
export function SuppliedParent(this: Component<{}>, props: { items: Child[] }) {
	parentOwner = this;
	return () => <section>{props.items}</section>;
}
/** One unchanged opaque handle, reused within its current parent list. */
export const stableOperation = <StableButton />;
/** One supplied conditional handle whose removed instances must still dispose. */
export const spanOperation = <ConditionalSpan />;
/** Supplies a qualified operation root to SSR and strict adoption. */
export function root(items: Child[]) {
	return <SuppliedParent items={items} />;
}
/** Delivers the next sibling list through the supported native root entry. */
export function mount(host: Element, items: Child[], options: RenderOptions) {
	render(<SuppliedParent items={items} />, host, options);
}

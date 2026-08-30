import { createRef, type Component, type RootLifecycle } from '@exactjs/core';

let counter: Component<{ count: number }> | undefined;
let control: Component<{ link: boolean }> | undefined;
let controlRoot: RootLifecycle<Element> | undefined;
let refButton: Component<{ useFirst: boolean }> | undefined;

export let counterSetups = 0;
export const firstButtonRef = createRef<HTMLButtonElement>('compiled-first');
export const secondButtonRef = createRef<HTMLButtonElement>('compiled-second');
const connectedMountRef = createRef<HTMLButtonElement>('connected-mount');
export const connectedMountOrder: string[] = [];
export let connectedMountSawPlacedRef = false;

/** Resets compiler-backed lifecycle fixture observations. */
export function resetRootLifecycleFixtures() {
	counterSetups = 0;
	connectedMountOrder.length = 0;
	connectedMountSawPlacedRef = false;
}

function ConnectedMountChild(this: Component<{}>) {
	this.onMount(() => {
		connectedMountSawPlacedRef = Boolean(this.refs.get(connectedMountRef)?.parentNode);
		connectedMountOrder.push('child');
	});
	return () => <button ref={this.ref(connectedMountRef)}>Connected</button>;
}

/** Compiler-backed fixture that observes final DOM placement from nested mount handlers. */
export function ConnectedMountParent(this: Component<{}>) {
	this.onMount(() => connectedMountOrder.push('parent'));
	return () => (
		<section>
			<ConnectedMountChild />
		</section>
	);
}

/** Compiler-backed focused update fixture. */
export function LifecycleCounter(this: Component<{ count: number }>) {
	counter = this;
	counterSetups++;
	this.state.count = 0;
	return () => <button>{this.state.count}</button>;
}

/** Reads the mounted lifecycle counter. */
export function lifecycleCounterInstance() {
	if (!counter) throw new Error('LifecycleCounter is not mounted');
	return counter;
}

function DebugChild() {
	return () => <span>child</span>;
}

/** Compiler-backed nested component marker fixture. */
export function DebugParent() {
	return () => (
		<main>
			<DebugChild />
		</main>
	);
}

/** Compiler-backed component-root replacement fixture. */
export function RootControl(this: Component<{ link: boolean }>) {
	control = this;
	this.state.link = false;
	controlRoot = this.refs.root();
	return () => (this.state.link ? <a href="#next">Next</a> : <button>Next</button>);
}

/** Reads the mounted root-control component. */
export function rootControlInstance() {
	if (!control) throw new Error('RootControl is not mounted');
	return control;
}

/** Reads the root lifecycle owned by RootControl. */
export function rootControlLifecycle() {
	if (!controlRoot) throw new Error('RootControl root is unavailable');
	return controlRoot;
}

/** Compiler-backed changing-ref fixture. */
export function ChangingRefButton(this: Component<{ useFirst: boolean }>) {
	refButton = this;
	this.state.useFirst = true;
	return () => (
		<button ref={this.state.useFirst ? this.ref(firstButtonRef) : this.ref(secondButtonRef)}>
			Save
		</button>
	);
}

/** Reads the mounted changing-ref component. */
export function changingRefButtonInstance() {
	if (!refButton) throw new Error('ChangingRefButton is not mounted');
	return refButton;
}

import { createRef, type Component } from '@exactjs/core';

let conditionalTextOwner: Component<{ useA: boolean; a: string; b: string }> | undefined;
let conditionalRefOwner: Component<{ mode: 'button' | 'input' }> | undefined;

/** Stable ref used to verify cleanup when a compiled structural branch is replaced. */
export const compiledButtonRef = createRef<HTMLButtonElement>('compiled-button');

/** Compiler-backed conditional text-binding fixture. */
export function ConditionalTextBinding(this: Component<{ useA: boolean; a: string; b: string }>) {
	conditionalTextOwner = this;
	this.state.useA = true;
	this.state.a = 'A';
	this.state.b = 'B';

	return () => <span>{this.state.useA ? this.state.a : this.state.b}</span>;
}

/** Returns the mounted conditional text-binding fixture instance. */
export function conditionalTextBindingInstance() {
	if (!conditionalTextOwner) throw new Error('ConditionalTextBinding is not mounted');
	return conditionalTextOwner;
}

/** Compiler-backed structural replacement fixture with an owned ref. */
export function ConditionalRefSubtree(this: Component<{ mode: 'button' | 'input' }>) {
	conditionalRefOwner = this;
	this.state.mode = 'button';

	return () => (
		<section>
			{this.state.mode === 'button' ? (
				<button ref={this.ref(compiledButtonRef)}>Save</button>
			) : (
				<input value="Saved" />
			)}
		</section>
	);
}

/** Returns the mounted structural-ref fixture instance. */
export function conditionalRefSubtreeInstance() {
	if (!conditionalRefOwner) throw new Error('ConditionalRefSubtree is not mounted');
	return conditionalRefOwner;
}

/** Compiler-backed delegated-listener adoption fixture. */
export function AdoptedButton(props: { clicked(): void }) {
	return () => <button onClick={props.clicked}>server</button>;
}

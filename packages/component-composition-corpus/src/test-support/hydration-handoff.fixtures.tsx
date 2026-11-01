import type { Child, Component } from '@exactjs/core';
// exactc consumes this namespace in the enhancement attribute.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as theme from '@exactjs/theme/enhancements' with { type: 'exact-enhancement' };

/** Ordinary stateful receiver whose enhanced header leaves server-owned children mounted. */
export function HandoffFold(
	this: Component<{ open: boolean }>,
	props: { label: string; children?: Child }
) {
	this.state.open = false;
	return () => (
		<section className="handoff-fold">
			<button
				theme:action="quiet"
				type="button"
				aria-expanded={this.state.open ? 'true' : 'false'}
				onClick={() => {
					this.state.open = !this.state.open;
				}}
			>
				{props.label}
			</button>
			<div className="handoff-body" hidden={!this.state.open}>
				{props.children}
			</div>
		</section>
	);
}

/** Independent caller supplies real list markup through the receiver's ordinary children prop. */
export function HandoffOwner() {
	return () => (
		<main>
			<HandoffFold label="Three frames">
				<ul className="handoff-items">
					<li>First frame</li>
					<li>Second frame</li>
					<li>Third frame</li>
				</ul>
			</HandoffFold>
		</main>
	);
}

/** Paired source root used to check strict adoption independently of package boundary discovery. */
export const handoffRoot = <HandoffOwner />;

import type { Component } from '@exactjs/core';

/** Exposes the durable owner for conditional class update and disposal assertions. */
export let conditionalClassOwner: Component<{ active: boolean }>;

/** Shares ordinary and prototype-named class tokens across compiled and general hosts. */
export function ConditionalClassKeys(this: Component<{ active: boolean }>) {
	conditionalClassOwner = this;
	this.state.active = true;
	return () => (
		<main>
			<span
				data-class-keys="compiled"
				className="base"
				className:__proto__={this.state.active}
				className:constructor={this.state.active}
				className:prototype={this.state.active}
			/>
			<exact-class-keys
				data-class-keys="general"
				className="base"
				className:__proto__={this.state.active ? 1 : 0}
				className:constructor={this.state.active}
				className:prototype={this.state.active}
			/>
			<button
				data-class-toggle
				onClick={() => {
					this.state.active = !this.state.active;
				}}
			>
				Toggle
			</button>
		</main>
	);
}

/** Creates the native receipt for the shared conditional-class contract. */
export const conditionalClassRoot = () => <ConditionalClassKeys />;

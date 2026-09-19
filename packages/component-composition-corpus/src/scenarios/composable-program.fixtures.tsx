import type { Component, Child } from '@exactjs/core';
import { childrenOf, partitionChildren, withChildren } from '@exactjs/core/children';

/** Counts durable receiver lifetimes independently of structural inspection. */
export const compositionLifetime = { created: 0, disposed: 0 };
/** Most recently constructed receiver for update assertions. */
export let compositionOwner: Component<{ count: number }>;

function Counter(this: Component<{ count: number }>) {
	compositionOwner = this;
	compositionLifetime.created++;
	this.state.count = 1;
	this.onUnmount(() => compositionLifetime.disposed++);
	return () => <b>{this.state.count}</b>;
}

function Inspect(props: { children?: Child; derive: boolean }) {
	const parts = partitionChildren(props.children, { selected: 'span' });
	const selected = parts.selected[0];
	const children = childrenOf(selected);
	return () => (props.derive ? withChildren(selected, children) : selected);
}

/** Exercises inspection and derivation of a compiled intrinsic containing a durable child. */
export const composableProgramRoot = (derive: boolean) => (
	<Inspect derive={derive}>
		<span title="retained">
			<Counter />
		</span>
	</Inspect>
);

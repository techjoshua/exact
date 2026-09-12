import type { Component, RootLifecycle } from '@exactjs/core';

type Row = { id: string; label: string };
let owner: Component<{ rows: Row[] }>;
let lifecycle: RootLifecycle<Element>;

/** Exercises root publication after keyed row updates and reordering. */
export function KeyedRoot(this: Component<{ rows: Row[] }>) {
	owner = this;
	this.state.rows = [
		{ id: 'a', label: 'A' },
		{ id: 'b', label: 'B' }
	];
	lifecycle = this.refs.root();
	return () =>
		this.map(
			this.state.rows,
			(item) => item.id,
			(item) => <button>{item.label}</button>,
			'root-rows'
		);
}

/** Returns the mounted fixture's state and observable root lifecycle. */
export function keyedRootState() {
	return { owner, lifecycle };
}

import type { Child, Component } from '@exactjs/core';

function child(value: string): Child {
	return value;
}

function EmptyChildRange(this: Component<{ count: number }>) {
	this.state.count = 0;
	return () => (
		<section>
			<div data-range>{child(this.state.count % 2 ? 'Visible' : '')}</div>
			<input value="Original" />
			<button onClick={() => this.state.count++}>Toggle {this.state.count}</button>
		</section>
	);
}

/** A general child expression starts empty, becomes text, and returns to empty. */
export const emptyChildRangeRoot = () => <EmptyChildRange />;

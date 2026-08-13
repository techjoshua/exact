import type { Component } from '@exactjs/core';

type CounterState = { count: number };

/** Demonstrates precise state and derived-text updates with direct mutation. */
export function CounterDemo(this: Component<CounterState>) {
	this.state.count = 0;
	const doubled = this.state.count * 2;

	return () => (
		<section className="demo counter-demo" aria-label="Interactive counter example">
			<div>
				<p className="demo-kicker">Live eXact component</p>
				<strong className="counter-value">{this.state.count}</strong>
				<span className="counter-derived">twice that is {doubled}</span>
			</div>
			<button type="button" onClick={() => this.state.count++}>
				+1
			</button>
		</section>
	);
}

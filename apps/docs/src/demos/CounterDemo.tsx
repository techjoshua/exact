import type { Component } from '@exactjs/core';

type CounterState = { count: number; lastChanged: string };

export function CounterDemo(this: Component<CounterState>) {
	this.state.count = 0;
	this.state.lastChanged = 'Nothing has changed yet.';
	const doubled = this.state.count * 2;

	const change = (amount: number) => {
		this.state.count += amount;
		this.state.lastChanged = `Only the count cells changed at ${new Date().toLocaleTimeString()}.`;
	};

	return () => (
		<section className="demo counter-demo" aria-label="Interactive counter example">
			<div>
				<p className="demo-kicker">Live eXact component</p>
				<strong className="counter-value">{this.state.count}</strong>
				<span className="counter-derived">twice that is {doubled}</span>
			</div>
			<div className="button-row">
				<button type="button" onClick={() => change(-1)}>
					−1
				</button>
				<button type="button" onClick={() => change(1)}>
					+1
				</button>
				<button
					type="button"
					onClick={() => {
						this.state.count = 0;
						this.state.lastChanged = 'Back at the starting point.';
					}}
				>
					Reset
				</button>
			</div>
			<p className="demo-status" aria-live="polite">
				{this.state.lastChanged}
			</p>
		</section>
	);
}

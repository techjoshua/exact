import type { Component } from '@exactjs/core';
import { ReactStepper } from './react/ReactStepper.js';

type ReactCompatibilityState = { quantity: number };

/** Shows reactive values crossing a compiler-generated React compatibility boundary. */
export function ReactCompatibilityDemo(this: Component<ReactCompatibilityState>) {
	this.state.quantity = 2;
	const total = this.state.quantity * 12;

	return () => (
		<section className="demo" aria-label="React compatibility example">
			<div className="demo-heading-row">
				<div>
					<p className="demo-kicker">Native eXact owner</p>
					<strong>{this.state.quantity} licenses</strong>
				</div>
				<button type="button" onClick={() => this.state.quantity++}>
					Change from eXact
				</button>
			</div>
			<ReactStepper
				value={this.state.quantity}
				onChange={(quantity) => (this.state.quantity = quantity)}
			/>
			<p className="demo-status" aria-live="polite">
				Derived by eXact: ${total} / month
			</p>
		</section>
	);
}

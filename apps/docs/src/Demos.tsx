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

type PriceState = { quantity: number; price: number; express: boolean };

export function PriceDemo(this: Component<PriceState>) {
	this.state.quantity = 3;
	this.state.price = 24;
	this.state.express = false;
	const subtotal = this.state.quantity * this.state.price;
	const shipping = this.state.express ? 14 : subtotal >= 75 ? 0 : 6;
	const total = subtotal + shipping;

	return () => (
		<section className="demo price-demo" aria-label="Reactive price calculator">
			<div className="price-controls">
				<label>
					Quantity <strong>{this.state.quantity}</strong>
					<input
						type="range"
						min="1"
						max="8"
						value:input={this.state.quantity}
					/>
				</label>
				<label>
					Unit price <strong>${this.state.price}</strong>
					<input
						type="range"
						min="8"
						max="60"
						step="2"
						value:input={this.state.price}
					/>
				</label>
				<label className="check-row">
					<input
						type="checkbox"
						checked:change={this.state.express}
					/>
					Express delivery
				</label>
			</div>
			<dl className="receipt">
				<div>
					<dt>Subtotal</dt>
					<dd>${subtotal}</dd>
				</div>
				<div>
					<dt>Delivery</dt>
					<dd>{shipping === 0 ? 'Free' : `$${shipping}`}</dd>
				</div>
				<div className="receipt-total">
					<dt>Total</dt>
					<dd>${total}</dd>
				</div>
			</dl>
		</section>
	);
}

type ReadingItem = {
	/** @exact key */
	id: string;
	title: string;
	note: string;
};

type ListState = { items: ReadingItem[] };
type ReadingRowState = { expanded: boolean };

const initialReading: ReadingItem[] = [
	{ id: 'compiler', title: 'Compiler-guided JSX', note: 'Expressions remain independently reactive.' },
	{ id: 'tasks', title: 'Owned tasks', note: 'Work is cancelled with its component.' },
	{ id: 'router', title: 'Nested routing', note: 'The docs shell uses it too.' }
];

export function KeyedListDemo(this: Component<ListState>) {
	this.state.items = initialReading.map((item) => ({ ...item }));

	const rotate = () => {
		const first = this.state.items.shift();
		if (first) this.state.items.push(first);
	};

	return () => (
		<section className="demo list-demo" aria-label="Keyed list identity example">
			<div className="demo-heading-row">
				<div>
					<p className="demo-kicker">Reading queue</p>
					<h3>Identity survives movement</h3>
				</div>
				<button type="button" onClick={rotate}>
					Move first to last
				</button>
			</div>
			<ol className="reading-list">
				{this.state.items.map((item) => (
					<ReadingRow item={item} />
				))}
			</ol>
		</section>
	);
}

function ReadingRow(this: Component<ReadingRowState>, props: { item: ReadingItem }) {
	// This local state belongs to the keyed item component, not its array position.
	this.state.expanded = props.item.id === 'compiler';

	return () => (
		<li>
			<button
				type="button"
				aria-expanded={this.state.expanded}
				onClick={() => {
					this.state.expanded = !this.state.expanded;
				}}
			>
				<span>{props.item.title}</span>
				<span aria-hidden="true">{this.state.expanded ? '−' : '+'}</span>
			</button>
			{this.state.expanded ? <p>{props.item.note}</p> : null}
		</li>
	);
}

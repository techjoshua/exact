import type { Component } from '@exactjs/core';

type PriceState = { quantity: number; price: number; express: boolean };

/** Demonstrates native form bindings driving several derived price expressions. */
export function PriceDemo(this: Component<PriceState>) {
	this.state.quantity = 3;
	this.state.price = 24;
	this.state.express = false;
	const subtotal = this.state.quantity * this.state.price;
	const shipping = this.state.express ? 14 : subtotal >= 75 ? 0 : 6;
	const total = subtotal + shipping;

	return () => (
		<section
			theme:surface="raised"
			className="demo price-demo"
			aria-label="Reactive price calculator"
		>
			<div className="price-controls">
				<label>
					Quantity <strong>{this.state.quantity}</strong>
					<input theme:field type="range" min="1" max="8" value:onInput={this.state.quantity} />
				</label>
				<label>
					Unit price <strong>${this.state.price}</strong>
					<input
						theme:field
						type="range"
						min="8"
						max="60"
						step="2"
						value:onInput={this.state.price}
					/>
				</label>
				<label className="check-row">
					<input theme:selection type="checkbox" checked:onChange={this.state.express} />
					Express delivery
				</label>
			</div>
			<dl theme:surface="sunken" className="receipt">
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

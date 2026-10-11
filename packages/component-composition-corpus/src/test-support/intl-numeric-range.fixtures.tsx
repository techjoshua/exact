import { type Component } from '@exactjs/core';
import { rangeLabel } from './intl-numeric-range-values.js';

/** Checks the shared renderer's protocol endpoints through native retained bindings. */
export function IntlNumericRangeProbe(this: Component<{ step: number }>) {
	this.state.step = 0;
	return () => (
		<section>
			<output id="numeric-range-result">
				{rangeLabel(1, this.state.step === 0 ? 1 : this.state.step + 1)}
			</output>
			<button id="numeric-range-next" onClick={() => this.state.step++}>
				Next range
			</button>
		</section>
	);
}

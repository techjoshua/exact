import { type Component } from '@exactjs/core';
import { projectedLabel, projectionDate } from './intl-projection-values.js';

/** Retains date defaults and prepared values through updates and hydration. */
export function IntlProjectionProbe(this: Component<{ step: number }>) {
	this.state.step = 0;
	return () => (
		<section>
			<output id="intl-projection-result">
				{projectionDate(this.state.step).toLocaleDateString('en-US', {
					hour: 'numeric',
					timeZone: 'UTC'
				})}
				{' / '}
				{projectionDate(this.state.step).toLocaleTimeString('en-US', {
					year: 'numeric',
					timeZone: 'UTC'
				})}
				{' / '}
				{projectedLabel(this.state.step)}
			</output>
			<button id="intl-projection-next" onClick={() => this.state.step++}>
				Next projection
			</button>
		</section>
	);
}

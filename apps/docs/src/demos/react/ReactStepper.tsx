/** @jsxImportSource react */
import { useState } from 'react';
import { ExactCompatibilityBadge } from '../ExactCompatibilityBadge.jsx';

/** Props exchanged between the native eXact owner and the React-owned demo control. */
export type ReactStepperProps = {
	value: number;
	onChange(value: number): void;
};

/** A React-owned control used to demonstrate direct JSX interop in the docs app. */
export function ReactStepper({ value, onChange }: ReactStepperProps) {
	const [reactClicks, setReactClicks] = useState(0);
	const change = (next: number) => {
		setReactClicks((count) => count + 1);
		onChange(next);
	};

	return (
		<div className="react-stepper">
			<p className="demo-kicker">React-owned control</p>
			<div className="button-row">
				<button type="button" onClick={() => change(Math.max(1, value - 1))}>
					-
				</button>
				<strong>{value}</strong>
				<button type="button" onClick={() => change(value + 1)}>
					+
				</button>
			</div>
			<small>React-local state: {reactClicks} control changes</small>
			<ExactCompatibilityBadge />
		</div>
	);
}

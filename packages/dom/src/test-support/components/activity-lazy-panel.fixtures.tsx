import type { Component } from '@exactjs/core';
import {
	lazyActivityGate,
	lazyActivitySetups,
	lazyActivityUnmounts
} from './activity-lazy-control.js';

await lazyActivityGate;

/** Stateful lazy content whose instance belongs to its root. */
export function Panel(this: Component<{ count: number }>, props: { label: string }) {
	lazyActivitySetups.push(props.label);
	this.state.count = 0;
	this.onUnmount(() => lazyActivityUnmounts.push(props.label));
	return () => (
		<button onClick={() => this.state.count++}>
			{props.label}:{this.state.count}
		</button>
	);
}

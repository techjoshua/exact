import type { Component } from '@exactjs/core';

/** Inputs controlling the Sudoku completion ring's percentage and compact presentation. */
export interface ProgressOrbitProps {
	progress: number;
	compact?: boolean;
	showLabel?: boolean;
}

/** Renders the same reactive completion ring in wide and compact layouts. */
export function ProgressOrbit(this: Component<{}>, props: ProgressOrbitProps) {
	return () => (
		<div
			className="progress-orbit"
			className:progress-orbit-compact={props.compact}
			style={{
				background: `conic-gradient(var(--accent) ${props.progress}%, var(--accent-soft) 0)`
			}}
			aria-label={`${props.progress}% filled`}
		>
			<strong>{props.progress}%</strong>
			{props.showLabel ? <span>filled</span> : null}
		</div>
	);
}

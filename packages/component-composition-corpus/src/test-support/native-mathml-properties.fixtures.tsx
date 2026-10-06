import type { Component } from '@exactjs/core';

type MathProps = { display: 'block' | 'inline'; color: string; thickness: string };
/** Exposes the MathML property owner for retained updates and disposal checks. */
export let mathPropertyOwner: Component<MathProps>;

/** Exercises reflected-independent MathML attributes in explicit and spread property groups. */
export function NativeMathProperties(this: Component<MathProps>) {
	mathPropertyOwner = this;
	this.state.display = 'block';
	this.state.color = 'red';
	this.state.thickness = '1px';
	return () => (
		<main>
			<math data-math-properties="direct" display={this.state.display} mathcolor={this.state.color}>
				<mfrac linethickness={this.state.thickness}>
					<mi mathvariant="normal">x</mi>
					<mn>2</mn>
				</mfrac>
			</math>
			<math
				data-math-properties="spread"
				{...{ display: this.state.display, mathcolor: this.state.color }}
			>
				<mfrac {...{ linethickness: this.state.thickness }}>
					<mi>x</mi>
					<mn>2</mn>
				</mfrac>
			</math>
			<button
				data-math-toggle
				onClick={() => {
					this.state.display = this.state.display === 'block' ? 'inline' : 'block';
					this.state.color = this.state.color === 'red' ? 'blue' : 'red';
					this.state.thickness = this.state.thickness === '1px' ? '2px' : '1px';
				}}
			>
				Toggle math
			</button>
		</main>
	);
}

/** Creates the shared paired MathML property fixture receipt. */
export const nativeMathRoot = () => <NativeMathProperties />;

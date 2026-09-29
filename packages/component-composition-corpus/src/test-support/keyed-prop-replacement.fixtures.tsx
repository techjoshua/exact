import { type Component } from '@exactjs/core';

function Line(props: { number: number; lit: boolean }) {
	return () => <li data-lit={props.lit}>{props.number}</li>;
}

function Report(props: { hovered: number; numbers: number[] }) {
	const rows = props.numbers.map((number) => ({ number }));
	return () => (
		<ul>
			{rows.map((row) => (
				<Line key={row.number} {...row} lit={row.number === props.hovered} />
			))}
		</ul>
	);
}

/** Keeps keyed row identity while replacing projected values and independent props. */
export function HoverProbe(this: Component<{ hovered: number; numbers: number[] }>) {
	this.state.hovered = 0;
	this.state.numbers = [1, 2];
	return () => (
		<section data-prop-replacement>
			<button
				onClick={() => {
					this.state.numbers = [2, 3];
				}}
			>
				Replace
			</button>
			<button
				onClick={() => {
					this.state.hovered = 2;
				}}
			>
				Hover
			</button>
			<button
				onClick={() => {
					this.state.hovered = 3;
				}}
			>
				Next hover
			</button>
			<button
				onClick={() => {
					this.state.numbers = [];
				}}
			>
				Clear
			</button>
			<output>{this.state.hovered}</output>
			<Report hovered={this.state.hovered} numbers={this.state.numbers} />
		</section>
	);
}

/** Creates a paired root for keyed projected props. */
export function hoverRoot() {
	return <HoverProbe />;
}

/** Shares a fresh Map snapshot across multiple reactive consumers. */
export function MapProjectionProbe(this: Component<{ rows: Map<string, string> }>) {
	this.state.rows = new Map([['one', 'One']]);
	const rows = Array.from(this.state.rows.values());
	return () => (
		<section data-map-projection>
			<button onClick={() => this.state.rows.set('two', 'Two')}>Add row</button>
			<button onClick={() => this.state.rows.delete('one')}>Remove row</button>
			<output>{rows.length}</output>
			<ul>
				{rows.map((row) => (
					<li key={row}>{row}</li>
				))}
			</ul>
		</section>
	);
}

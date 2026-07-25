import { peek, type Component } from '@exactjs/core';

type ReadingItem = {
	/** @exact key */
	id: string;
	title: string;
	note: string;
};

type ListState = { items: ReadingItem[] };
type ReadingRowState = { expanded: boolean };

const initialReading: ReadingItem[] = [
	{
		id: 'compiler',
		title: 'Compiler-guided JSX',
		note: 'Expressions remain independently reactive.'
	},
	{ id: 'tasks', title: 'Owned tasks', note: 'Work is cancelled with its component.' },
	{ id: 'router', title: 'Nested routing', note: 'The docs shell uses it too.' }
];

/** Demonstrates component identity surviving keyed collection reordering. */
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
	this.state.expanded = peek(() => props.item.id === 'compiler');

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

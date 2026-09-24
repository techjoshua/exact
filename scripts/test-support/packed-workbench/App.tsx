import type { Component } from '@exactjs/core';
import { Control, Row } from '@acceptance/controls';

type State = {
	version: number;
	selected: number;
	active: boolean;
	visible: boolean;
	removed: string;
	items: { id: string; label: string }[];
};
/** Owns the same observable transitions in browser-only and paired server/client builds. */
export function App(this: Component<State>) {
	this.state.version = 1;
	this.state.selected = 0;
	this.state.active = true;
	this.state.visible = true;
	this.state.removed = '';
	this.state.items = [
		{ id: 'a', label: 'Alpha' },
		{ id: 'b', label: 'Beta' }
	];
	const selectionFor = (version: number) => () => {
		this.state.selected = version;
	};
	const summary = { label: `Report ${this.state.version}`, visible: this.state.visible };
	const rows = this.state.items.map((item) => ({
		...item,
		label: `${summary.label}: ${item.label}`
	}));
	return () => (
		<main>
			<h1>{summary.label}</h1>
			{summary.visible ? <p data-summary>{summary.label}</p> : null}
			<Control
				label={summary.label}
				select={this.state.active ? selectionFor(this.state.version) : undefined}
			/>
			<output data-selected>{this.state.selected}</output>
			<input aria-label="Notes" value="initial" />
			<ul>
				{rows.map((row) => (
					<Row
						key={row.id}
						{...row}
						removed={(id) => {
							this.state.removed += id;
						}}
					/>
				))}
			</ul>
			<output data-removed>{this.state.removed}</output>
			<button
				data-update
				onClick={() => {
					this.state.version = 2;
					this.state.visible = false;
					this.state.items = [{ id: 'b', label: 'Changed' }];
				}}
			>
				Update
			</button>
			<button
				data-remove
				onClick={() => {
					this.state.version = 3;
					this.state.visible = true;
					this.state.active = false;
					this.state.items = [];
				}}
			>
				Remove
			</button>
		</main>
	);
}

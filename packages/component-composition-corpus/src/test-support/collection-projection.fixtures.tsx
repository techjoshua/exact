import { TaskContext, type Component } from '@exactjs/core';

type Row = {
	/** @exact key */
	id: number;
	label: string;
};

function copyRow(row: Row) {
	return { ...row };
}

function identity<T>(value: T) {
	return value;
}

function count(rows: readonly Row[]) {
	return rows.length;
}

/** Keeps shared snapshots and inline data projections synchronized with keyed list ownership. */
export function CollectionProjectionProbe(
	this: Component<{ items: Row[]; rows: Map<number, Row>; seen: string }>
) {
	this.state.items = [
		{ id: 1, label: 'a' },
		{ id: 2, label: 'b' }
	].map(copyRow);
	this.state.rows = new Map([
		[1, { id: 1, label: 'a' }],
		[2, { id: 2, label: 'b' }]
	]);
	this.state.seen = '';
	const { rows } = { rows: [...this.state.items] };
	const total = count(rows);
	// The compiler consumes the policy parameter without an authored context operation.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const save = (task: TaskContext = TaskContext.client()) => {
		this.state.seen = rows.map((row) => row.label).join(',');
	};
	return () => (
		<section data-collection-projection>
			<button
				onClick={() => {
					this.state.items.push({ id: 3, label: 'c' });
					this.state.rows.set(3, { id: 3, label: 'c' });
				}}
			>
				Insert
			</button>
			<button
				onClick={() => {
					this.state.items = [
						{ id: 2, label: 'B' },
						{ id: 3, label: 'C' },
						{ id: 4, label: 'D' }
					];
					this.state.rows = new Map([
						[2, { id: 2, label: 'B' }],
						[3, { id: 3, label: 'C' }],
						[4, { id: 4, label: 'D' }]
					]);
				}}
			>
				Replace
			</button>
			<button
				onClick={() => {
					this.state.items.sort((a, b) => b.id - a.id);
					this.state.rows = new Map([
						[4, { id: 4, label: 'D' }],
						[3, { id: 3, label: 'C' }],
						[2, { id: 2, label: 'B' }]
					]);
				}}
			>
				Sort
			</button>
			<button
				onClick={() => {
					this.state.items[2].label = 'BB';
					this.state.rows.get(2)!.label = 'BB';
				}}
			>
				Update
			</button>
			<button
				onClick={() => {
					this.state.items.pop();
					this.state.rows.delete(2);
				}}
			>
				Remove
			</button>
			<button
				onClick={() => {
					this.state.items.push({ id: 2, label: 'new' });
					this.state.rows.set(2, { id: 2, label: 'new' });
				}}
			>
				Reinsert
			</button>
			<button
				onClick={() => {
					this.state.seen = rows.map((row) => row.label).join(',');
				}}
			>
				Event
			</button>
			<button onClick={() => save()}>Task</button>
			<output>{total}</output>
			<small>{this.state.seen}</small>
			<ul data-shared>
				{rows.map((row) => (
					<li key={row.id}>{row.label}</li>
				))}
			</ul>
			<ul data-inline>
				{identity(
					Array.from(this.state.rows.keys())
						.map((id) => ({ id, label: this.state.rows.get(id)!.label }))
						.map((row) => <li key={row.id}>{row.label}</li>)
				)}
			</ul>
			<ul data-block>
				{rows
					.map((row) => {
						const label = row.label;
						return <li key={row.id}>{label}</li>;
					})
					.slice()}
			</ul>
			<ul data-function>
				{identity(
					rows.map(function (row) {
						return <li key={row.id}>{row.label}</li>;
					})
				)}
			</ul>
			<ul data-inferred-nested>{[rows.map((row) => <li>{row.label}</li>)]}</ul>
			<ul data-inferred-spread>
				{[
					...rows.map((row) => {
						const label = row.label;
						return <li>{label}</li>;
					})
				]}
			</ul>
			<ul data-spread>{[...rows.map((row) => <li key={row.id}>{row.label}</li>)]}</ul>
		</section>
	);
}

/** Supplies the same component root to mount and strict hydration journeys. */
export function collectionProjectionRoot() {
	return <CollectionProjectionProbe />;
}

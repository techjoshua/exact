import { type Component } from '@exactjs/core';

/** Row storage replaced by ordinary authored assignment. */
export type AssignmentListRow = { id: string; label: string };
/** Fixture-owned observations distinguish durable children from list expression scopes. */
export const assignmentListLifecycle = {
	mounted: [] as Component<{ clicks: number }>[],
	removed: [] as Component<{ clicks: number }>[]
};
/** Exposes the durable parent and its state for alias assertions. */
export let assignmentListOwner: Component<{ rows: AssignmentListRow[] }>;

function Row(this: Component<{ clicks: number }>, props: { label: string }) {
	this.state.clicks = 0;
	this.onMount(() => assignmentListLifecycle.mounted.push(this));
	this.onUnmount(() => assignmentListLifecycle.removed.push(this));
	return () => (
		<div data-child>
			<span data-child-label>{props.label}</span>
			<input aria-label="Row draft" />
			<button data-interact onClick={() => this.state.clicks++}>
				{this.state.clicks}
			</button>
		</div>
	);
}

function AssignmentList(
	this: Component<{ rows: AssignmentListRow[] }>,
	props: { retained: boolean }
) {
	assignmentListOwner = this;
	this.state.rows = [{ id: 'row', label: 'A' }];
	return () => (
		<section data-assignment-list>
			<button
				data-replace
				onClick={() => {
					this.state.rows = props.retained ? [this.state.rows[0]] : [{ id: 'row', label: 'B' }];
				}}
			>
				Replace
			</button>
			<button data-edit onClick={() => (this.state.rows[0].label = 'C')}>
				Edit
			</button>
			<button data-remove onClick={() => (this.state.rows = [])}>
				Remove
			</button>
			<ul>
				{this.state.rows.map((row) => (
					<li key={row.id}>
						<span data-label>{row.label}</span>
						<Row label={row.label} />
					</li>
				))}
			</ul>
		</section>
	);
}

/** Creates a compiler-owned keyed list with a retained-reference control. */
export const assignmentListRoot = (retained: boolean) => <AssignmentList retained={retained} />;

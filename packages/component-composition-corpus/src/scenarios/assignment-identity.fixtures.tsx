import { type Component } from '@exactjs/core';

/** State shared by the authored assignment identity and nested-mutation controls. */
export type AssignmentIdentityState = {
	item: { value: number };
	rows: { value: number }[];
	branch: { item: { value: number }; rows: { value: number }[] };
};

/** Exposes the last mounted owner for source and paired-artifact assertions. */
export let assignmentIdentityOwner: Component<AssignmentIdentityState>;

function AssignmentIdentity(
	this: Component<AssignmentIdentityState>,
	props: {
		replacement: { value: number };
		rows: { value: number }[];
	}
) {
	assignmentIdentityOwner = this;
	this.state.item = { value: 1 };
	this.state.rows = [{ value: 1 }];
	this.state.branch = { item: { value: 1 }, rows: [{ value: 1 }] };
	return () => (
		<section>
			<output>
				{this.state.item.value}:{this.state.branch.item.value}
			</output>
			<output data-array>
				{this.state.rows[0].value}:{this.state.branch.rows[0].value}
			</output>
			<button
				onClick={() => {
					this.state.item = props.replacement;
					this.state.branch.item = props.replacement;
					this.state.rows = props.rows;
					this.state.branch.rows = props.rows;
				}}
			>
				replace
			</button>
		</section>
	);
}

/** Builds a compiler-owned root exercising numeric-slot and general-path authored assignment. */
export const assignmentIdentityRoot = (replacement: { value: number }, rows = [replacement]) => (
	<AssignmentIdentity replacement={replacement} rows={rows} />
);

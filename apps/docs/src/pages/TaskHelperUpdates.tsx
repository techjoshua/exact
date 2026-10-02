import type { Component } from '@exactjs/core';

/** Explains pending writes and receiver limits when tasks call shared helpers. */
export function TaskHelperUpdates(this: Component<{}>) {
	return () => (
		<details>
			<summary>State updates through helpers</summary>
			<p>
				Imported helpers can mutate passed state when eXact can follow the named argument paths. For
				opaque helpers or recursive traversal, returning data and assigning a named state field
				inside the task makes the update visible to the compiler. Server-side Map and Set mutations
				must occur directly in the task so their ordered changes can be recorded.
			</p>
			<p>
				When a blocking client task passes owned state to a helper, its writes remain pending until
				the task succeeds. Reads through that helper observe its pending changes. Replacement or
				disposal prevents the cancelled invocation from publishing.
			</p>
			<p>
				Compiled class helpers can use private methods, function fields, and private accessors.
				Their reads observe pending fields, and their field writes publish with the task. A getter
				or setter runs when called. Effects on external objects remain outside rollback. Nested
				calls also preserve readonly access to reactive collections.
			</p>
			<p>
				Shared helpers can live in ordinary <code>.ts</code> or <code>.js</code> modules. A compiled
				factory can return a function or a bound method for later task calls. Functions supplied by
				parameter defaults follow the same ownership rules. Each call uses the current task's
				pending state, even when an earlier task created the function. An arrow that captures a
				readonly receiver keeps that restriction.
			</p>
			<p>
				An unchanged external helper receives a proxy view of owned state. Aliases inside that view
				are stable, but equality with an original object captured elsewhere can differ. Helpers that
				require private class brands or reflective mutations need a supported compiled companion, or
				can return data for assignment inside the task.
			</p>
			<p>
				Consume pending Map and Set iterators inside the task. Their cursors and pending writes
				belong to that invocation and reject use after it publishes or is discarded. Return
				materialized data when it needs to be used later. Reflective access through a helper view
				also rejects substitution of a different accessor or write receiver.
			</p>
			<p>
				Date readers work through helper views. To change an owned Date inside pending work, assign
				a new Date value. Native timestamp setters reject before mutation.
			</p>
			<p>
				The <a href="https://github.com/techjoshua/exact/blob/main/docs/tasks.md">task reference</a>
				describes supported mutation paths, scheduling, ownership, and cancellation in detail.
			</p>
		</details>
	);
}

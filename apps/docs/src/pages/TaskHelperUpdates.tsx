import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';

const stateAccessSource = `import { stateAccess, type StateAccess } from '@exactjs/reactive';

class Counter {
  #step = 2;
  increment(state: StateAccess<{ count: number }>) {
    state.write('count', state.read('count') + this.#step);
  }
}

const counter = new Counter();
// Inside a blocking client task:
counter.increment(stateAccess(this.state));`;

/** Explains ordinary helper inputs and explicit state-access bridges. */
export function TaskHelperUpdates(this: Component<{}>) {
	return () => (
		<details>
			<summary>State updates through helpers</summary>
			<p>
				Shared helpers can live in your project or an external package. They execute their ordinary
				JavaScript. When a blocking client task passes owned state into a helper, it supplies a view
				whose supported writes remain pending until the task succeeds. Cancellation prevents
				publication.
			</p>
			<p>
				Plain fields, arrays and supported Map and Set operations work through this view. A helper's
				unrelated globals, private storage and external side effects remain outside rollback.
			</p>
			<p>
				For a helper that needs explicit property access, import <code>stateAccess</code> and
				<code>StateAccess</code> from <code>@exactjs/reactive</code>. Create access from the
				supplied state and pass it to the helper. Its <code>read(key)</code>,{' '}
				<code>write(key, value)</code> and
				<code>remove(key)</code> preserve the state view's policy. An ordinary class can accept this
				argument while keeping its private configuration on its original receiver.
			</p>
			<CodeBlock source={stateAccessSource} language="ts" title="Explicit helper state access" />
			<p>
				The counter uses its own private step. Its write to the supplied component state remains
				pending until the task succeeds.
			</p>
			<p>
				A view has a different identity from the original object. Use{' '}
				<code>sameStateTarget(a, b)</code>
				when you intend to compare the storage behind reactive and pending views. Native equality
				and identity-keyed collections keep their JavaScript behavior.
			</p>
			<p>
				Use state views and access capabilities within their creating task. Pass a new view when a
				later task calls a retained callback. Pending collection iterators also reject use after
				settlement.
			</p>
			<p>
				Private class receivers, reflective writes, prototype changes and incompatible frozen
				properties cannot be made transparent through a pending view. Pass supported fields or
				explicit state access, or return data for assignment inside the task. Date readers work
				through views. Replace a Date value to change its timestamp during pending work.
			</p>
			<p>
				Server helpers still need provable named writes and valid transport contracts. Returning
				data for assignment inside the server task provides an explicit publication boundary. These
				bridges do not bypass placement, secrets or remote write authorization.
			</p>
			<p>
				The bridge functions are optional named exports. Unused functions are removed by a
				production bundler. The{' '}
				<a href="https://github.com/techjoshua/exact/blob/main/docs/tasks.md">task reference</a>
				describes supported paths and ownership in detail.
			</p>
		</details>
	);
}

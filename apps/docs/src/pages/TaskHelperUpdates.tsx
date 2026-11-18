import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { taskSources } from './task-sources.js';

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
				When several steps share a state update, you can define a helper inside the task. Local
				functions and arrows retain the generation that created them. Finite synchronous methods in
				a named const object directly inside the task can use a captured component alias while
				keeping their ordinary method receivers and defaults.
			</p>
			<CodeBlock
				source={taskSources.taskLocalHelperSource}
				language="tsx"
				title="Excerpt: share an update within one task generation"
			/>
			<p>
				Cancellation prevents a later managed state write, including after an await. Earlier effects
				remain. Saving an original helper and calling it during another task does not transfer it to
				that newer generation.
			</p>
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
				properties cannot be made transparent through a pending view. A fresh wrapper with accessors
				does not inherit ownership of the state it contains. Pass supported fields or explicit state
				access, or return data for assignment inside the task. Date readers work through views.
				Replace a Date value to change its timestamp during pending work.
			</p>
			<p>
				When several server tasks need the same field update, pass the state object to a function in
				your project. The compiler keeps the helper unchanged and supplies task-owned state at the
				component call. Known plain-field writes retain the calling task's cancellation boundary,
				including after an awaited helper returns.
			</p>
			<p>
				Relative and absolute local helper imports use the implementation selected by your build
				adapter. Ordinary calls and task-owned updates share the same module state, including when
				adjacent JavaScript and TypeScript files differ. Package aliases and virtual modules do not
				supply a selected executable body through this local source path.
			</p>
			<CodeBlock
				source={taskSources.sharedStateHelperSource}
				language="tsx"
				title="Share a server field update"
			/>
			<p>
				In this example, <code>setLabel</code> keeps its ordinary parameters. Its assignment
				publishes the label, even when the value is unchanged. The supplied state is a pending view;
				keep its use within the creating task, including when the helper returns it.
			</p>
			<p>
				A helper receiving task-owned state can append a result with an ordinary{' '}
				<code>values.push(result)</code>
				call. When the server task succeeds, eXact publishes the Array's final changes. Retained
				entries keep their browser identity, and a server reorder preserves fields it did not
				change. Custom methods keep their ordinary JavaScript behavior. If you catch a native error
				and continue successfully, valid partial Array changes are included in that completion.
			</p>
			<p>
				An in-place change that is fully reverted sends no Array update, preserving newer browser
				edits. Explicit assignments and replacements keep their normal publication behavior. Use
				task keys and concurrency policies to coordinate work on the same entity. Independent entity
				fields can complete without resetting the list's current browser order.
			</p>
			<p>
				Framework integrations can also invoke a server task against explicit client root state.
				Register the <code>continuations</code> and <code>continuationArrays</code> returned by
				compiled component composition when creating that client. Ordinary authored tasks provide
				these bindings automatically. Lazy integrations can supply the same registration through
				<code>client.registerComponents()</code> before invoking the task. A root invocation without
				its Array binding rejects before sending a request.
			</p>
			<p>
				A helper receiving task-owned state may use ordinary nested functions and closures. Views
				still belong to their creating task, so pass a fresh view when another task invokes retained
				work. When the build cannot establish the helper's required state writes, return data and
				assign it inside the task. Placement, secrets, and transport authorization still apply.
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

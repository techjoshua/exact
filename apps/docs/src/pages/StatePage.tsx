import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { PriceDemo } from '../demos/PriceDemo.jsx';
import { Article } from './Article.jsx';

const derivedSource = `type PriceState = {
  quantity: number;
  price: number;
  express: boolean;
};

function Price(this: Component<PriceState>) {
  this.state.quantity = 3;
  this.state.price = 24;
  this.state.express = false;

  // These pure setup expressions become shared, lazy derived values.
  const subtotal = this.state.quantity * this.state.price;
  const shipping = this.state.express ? 14 : subtotal >= 75 ? 0 : 6;
  const total = subtotal + shipping;

  return () => (
    <section>
      <label>
        Quantity: {this.state.quantity}
        <input
          type="range"
          min="1"
          max="8"
          value:input={this.state.quantity}
        />
      </label>
      <label>
        Unit price: \${this.state.price}
        <input
          type="range"
          min="8"
          max="60"
          step="2"
          value:input={this.state.price}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked:change={this.state.express}
        />
        Express delivery
      </label>

      <dl>
        <div><dt>Subtotal</dt><dd>\${subtotal}</dd></div>
        <div><dt>Delivery</dt><dd>{shipping === 0 ? 'Free' : \`$\${shipping}\`}</dd></div>
        <div><dt>Total</dt><dd>\${total}</dd></div>
      </dl>
    </section>
  );
}`;

const explicitDerivedSource = `// This is the public, explicit equivalent of the compiler's
// derived-value model. The callback tracks quantity and price.
const subtotal = this.reactive(
  () => this.state.quantity * this.state.price
);

// this.reactive() returns a component-scoped value with a task shorthand.
subtotal.task((value, { signal }) => {
  reportEstimate(Number(value), { signal });
});

// It can also be used directly in JSX.
return () => <strong>\${subtotal}</strong>;`;

const viewDerivedSource = `function AccountBadge(
  this: Component<AccountState>
) {
  return () => {
    // This calculation belongs to one visual boundary. The compiler moves it
    // into that boundary's reactive closure; the whole view does not rerun.
    const label = this.state.online
      ? \`\${this.state.name} · online\`
      : this.state.name;

    return <strong>{label}</strong>;
  };
}`;

const derivedAssignmentSource = `function Summary(
  this: Component<SummaryState>,
  props: { taxRate: number; currency: string }
) {
  // The state targets are outputs. The reads on the right are dependencies.
  this.state.subtotal = this.state.quantity * this.state.price;

  // Destructuring publishes related results in one transaction.
  [this.state.tax, this.state.total] = calculateTotals(
    this.state.subtotal,
    props.taxRate
  );

  // peek() explicitly requests a one-time snapshot instead of synchronization.
  this.state.initialCurrency = peek(() => props.currency);

  return () => <Invoice state={this.state} />;
}`;

const collectionSource = `function Selection(
  this: Component<{
    prices: Map<string, number>;
    selected: Set<string>;
  }>,
  props: { productId: string }
) {
  return () => (
    <button onClick={() => {
      this.state.selected.add(props.productId);
      this.state.prices.set(props.productId, 42);
    }}>
      {this.state.selected.has(props.productId) ? 'Selected' : 'Select'}
      {' · $'}
      {this.state.prices.get(props.productId) ?? '—'}
    </button>
  );
}`;

/** Documents direct reactive state, derived expressions, batching, and explicit cells. */
export function StatePage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="State that reads like state"
			description="Read a field when you need it. Assign to it when something changes. Safe derived constants stay cached and update their consumers precisely."
			previous={{ path: '/learn/components', label: 'Components' }}
			next={{ path: '/learn/tasks', label: 'Tasks, dependencies & scheduling' }}
		>
			<section>
				<h2>Reactivity is the connective tissue</h2>
				<p>
					eXact state is a deeply reactive object owned by one component instance. Reading a field
					from a compiled derived expression, DOM expression, keyed collection, or task dependency
					records the connection. Assigning that field invalidates those consumers; it does not
					schedule the component function to execute again.
				</p>
				<p>
					This is how direct TypeScript stays precise. The compiler keeps source expressions intact
					long enough to turn them into lazy reactive cells, while the runtime tracks which fields
					each cell actually reads.
				</p>
			</section>
			<PriceDemo />
			<section>
				<h2>The demo and its complete source</h2>
				<p>
					Move the controls above and watch subtotal, delivery, and total follow the same dependency
					graph. The component below is the full shape of that demo rather than an abbreviated
					result-only version.
				</p>
				<CodeBlock source={derivedSource} language="tsx" title="Price.tsx" />
			</section>
			<section>
				<h2>Setup-derived values are shared component relationships</h2>
				<p>
					A safe derived declaration in setup normally describes a relationship owned by the
					component instance. The compiler can give it one lazy, cached derived cell, share its
					result across several DOM expressions, child props, lists, and task inputs, and stop
					propagation when recomputation produces the same value.
				</p>
				<p>
					Choose setup when several consumers should observe one result, when non-view work needs
					the value, or when an allocated result must retain one identity for all consumers. The{' '}
					<code>subtotal</code>, <code>shipping</code>, and <code>total</code> declarations in the
					demo form a component-owned graph rather than three pieces of render syntax.
				</p>
			</section>
			<section>
				<h2>View-local values belong to one visual boundary</h2>
				<p>
					A pure declaration inside the returned view is presentation-local. eXact does not rerun
					the whole view function when its inputs change. Instead, the compiler materializes that
					calculation inside the reactive DOM or prop closure that consumes it, so the closure reads
					fresh state rather than retaining the first render&apos;s local value. When every use has
					been materialized this way, the emitted render function drops the unused declaration and
					does not subscribe itself to the same inputs.
				</p>
				<CodeBlock source={viewDerivedSource} language="tsx" title="AccountBadge.tsx" />
				<p>
					Use this form—or put the expression directly in JSX—for a cheap calculation with one
					visual consumer, especially when it belongs to a branch or keyed item. Separate view
					boundaries do not implicitly share a view-local calculation; place it in setup when shared
					caching or identity is part of the relationship.
				</p>
				<p>
					For an ordinary setup declaration whose safe result has only one view consumer, the
					compiler may elide the standalone derived cell when the result is scalar or merely
					forwards an existing identity. This is an emitted-code optimization: the authored setup
					declaration remains its source definition for inspection. Shared values, fresh identity
					allocations, event or task consumers, and explicit reactive values keep their durable
					cells.
				</p>
			</section>
			<section>
				<h2>Use this.reactive() when the value itself is an API</h2>
				<p>
					The public <code>this.reactive()</code> API creates the component-owned boundary
					deliberately. Use it when you want a first-class reactive value, need to pass that value
					through another framework API, or want the boundary to remain explicit rather than
					eligible for inferred cell elision.
				</p>
				<CodeBlock source={explicitDerivedSource} language="tsx" title="Explicit derived value" />
				<p>
					A task function can accept the derived value as an ordinary argument. Calling it during
					setup records that argument expression as the activation dependency without another
					registration API.
				</p>
				<p>
					The explicit form is not “more reactive” than the inferred form. It commits to a
					first-class component-owned value that ordinary source may allow the compiler to represent
					more narrowly.
				</p>
			</section>
			<section>
				<h2>Assign derived results directly to state</h2>
				<p>
					When a setup assignment reads reactive state, props, or shared context, the compiler
					treats the right side as a repeatable calculation and the state target as its output.
					There is no need to wrap an assignment-only calculation in a task function.
				</p>
				<CodeBlock source={derivedAssignmentSource} language="tsx" title="Summary.tsx" />
				<p>
					An assignment with no reactive inputs remains ordinary one-time initialization. Use{' '}
					<code>peek()</code> when initialization intentionally snapshots a reactive input. Reading
					the same state target on the right would create a feedback cycle, so the compiler asks you
					to choose a <code>peek()</code> snapshot or a local task function instead.
				</p>
				<p>
					The initial synchronous calculation settles before the component&apos;s first render, so
					its state output is available when required props are passed to child components. Later
					dependency changes publish through the same owned calculation.
				</p>
				<p>
					In callbacks, chained, compound, logical, computed-key, array-destructured, and
					object-destructured writes keep JavaScript evaluation order and expression results.
					Destructuring may mix local and state targets, including defaults and rest. A server
					continuation still needs a statically transportable write path, so publish an enclosing
					state value instead of a dynamic path such as <code>rows[index].value</code> at that
					boundary.
				</p>
			</section>
			<section>
				<h2>Where reactive values can flow</h2>
				<div className="definition-grid">
					<code>Text and props</code>
					<p>Update a text node, property, attribute, class, or style at its own boundary.</p>
					<code>Branches</code>
					<p>Replace only the dynamic child region selected by a condition.</p>
					<code>Derived constants</code>
					<p>Compute lazily and share the result between multiple consumers.</p>
					<code>Lists</code>
					<p>Reconcile collection membership while preserving keyed item identity.</p>
					<code>Tasks</code>
					<p>Abort and rerun owned work when an activation dependency changes.</p>
					<code>Context</code>
					<p>Carry reactive configuration or data through descendants without prop plumbing.</p>
				</div>
			</section>
			<section>
				<h2>Maps and Sets are reactive collections</h2>
				<p>
					Use the native collection APIs directly. Map reads track individual keys, Set membership
					tracks individual values, and iteration tracks structural changes. Native return values
					and Set uniqueness are preserved.
				</p>
				<CodeBlock source={collectionSource} language="tsx" title="Selection.tsx" />
				<p>
					Maps and Sets are encoded for SSR, hydration, and server operations and restored as real
					collections. Server continuations return ordered entry deltas instead of the complete
					collection. Transported Map keys may be null, booleans, finite numbers, or strings; local
					collections may still use object keys.
				</p>
			</section>
		</Article>
	);
}

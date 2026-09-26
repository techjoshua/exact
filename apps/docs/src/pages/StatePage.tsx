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

  // These state-dependent expressions become shared, lazy derived values.
  const subtotal = this.state.quantity * this.state.price;
  const shipping = this.state.express ? 14 : subtotal >= 75 ? 0 : 6;
  const total = subtotal + shipping;

  return () => (
    <section>
      <label>
        Quantity: {this.state.quantity}
        <input type="range" min="1" max="8" value:onInput={this.state.quantity} />
      </label>
      <label>
        Unit price: \${this.state.price}
        <input type="range" min="8" max="60" step="2" value:onInput={this.state.price} />
      </label>
      <label>
        <input type="checkbox" checked:onChange={this.state.express} />
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
  const label = this.state.online
    ? \`\${this.state.name} · online\`
    : this.state.name;

  return () => <strong>{label}</strong>;
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
      {this.state.prices.get(props.productId) ?? 'unavailable'}
    </button>
  );
}`;

/** Documents direct reactive state, derived expressions, batching, and explicit cells. */
export function StatePage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="State that reads like state"
			description="Store changing values in this.state and use ordinary expressions to display and derive data."
			previous={{ path: '/learn/components', label: 'Components' }}
			next={{ path: '/learn/lists', label: 'Keyed lists' }}
		>
			<section>
				<h2>Update the values your view reads</h2>
				<p>
					When a cart’s quantity changes, its subtotal, delivery charge, and total need to agree.
					Keeping separate copies of those calculated values creates more state to synchronize. In
					eXact, store the inputs in <code>this.state</code> and calculate the rest with ordinary
					expressions. The compiler connects each calculation and view to the fields it reads, so
					changing an input updates its dependents. Nested object fields are reactive too.
				</p>
				<p>
					You can calculate one value from another with an ordinary expression. In the price
					example, changing quantity updates the subtotal and total. The component keeps the same
					instance throughout these changes.
				</p>
			</section>
			<PriceDemo />
			<section>
				<h2>Calculate a price from state</h2>
				<p>
					The example below calculates subtotal, delivery, and total from the quantity and price.
					Changing either input updates the displayed amounts.
				</p>
				<CodeBlock source={derivedSource} language="tsx" title="Price.tsx" />
			</section>
			<section>
				<h2>Calculate values from other values</h2>
				<p>
					A <strong>derived value</strong> is calculated from other values. A declaration such as
					<code>const subtotal = this.state.price * this.state.quantity</code> in the component body
					stays connected to those fields. eXact recalculates it when needed, shares the result
					between readers, and skips further updates when the result is unchanged.
				</p>
				<p>
					The compiler infers a derived value when it can prove the initializer is safe to
					reevaluate. Effectful work belongs in an interaction or task; an opaque helper must expose
					a valid pure-call contract before the compiler can use it in an inferred derived
					relationship.
				</p>
				<p>
					Keep a calculation in the component body when several parts of the view or a task need its
					result. Here, <code>shipping</code> uses <code>subtotal</code>, and <code>total</code>
					uses both. You can read the relationships directly from the expressions.
				</p>
				<p>
					Reading a derived value immediately after changing state gives the updated result, even
					when the calculation depends on other derived values. DOM updates are grouped for their
					scheduled turn. When a calculation produces the same result, dependent calculations can
					keep their existing values.
				</p>
				<p>
					Selecting an object from reactive state keeps its fields reactive. Updates to that object
					still reach expressions that read through the selection. Selecting a different object
					moves those subscriptions, even when both objects currently have equal fields.
				</p>
				<p>
					Dynamic reactive expressions follow the branch they actually read. When that branch
					changes, obsolete dependencies are released. Disposing their component or effect scope
					also releases observation, even if a synchronous callback continues reading state before
					it returns.
				</p>
				<p>
					Direct or indirect runtime cycles in explicit reactive values fail with a bounded eXact
					diagnostic. Cycles the compiler can prove in component setup are still reported at build
					time.
				</p>
				<p>
					When one reactive expression reads a nullable or union-valued derived declaration more
					than once, generated code samples its cell once for that evaluation. Ordinary TypeScript
					narrowing such as <code>point ? point.x : &quot;unavailable&quot;</code> therefore remains
					valid without assertions, while deferred handlers still read the current value when they
					run.
				</p>
				<p>
					A module-level declarative collection still maps once for each component render, so normal
					JavaScript visibility is preserved. Inside that map, compiler-proven item values that
					cannot invalidate are passed directly instead of receiving disposable reactive wrappers.
				</p>
			</section>
			<section>
				<h2>Keep the returned view declarative</h2>
				<p>
					eXact does not rerun the whole view function when its inputs change. Keep declarations and
					source control flow in the component body, then return the JSX expression directly. This
					gives a derived relationship one clear owner and lets every generated DOM or
					component-prop boundary reuse its cached result.
				</p>
				<CodeBlock source={viewDerivedSource} language="tsx" title="AccountBadge.tsx" />
				<p>
					Conditional expressions remain idiomatic inside JSX and update only their structural
					range. A callback owned by a keyed branch or item may also keep item-local calculations
					beside that item; it does not turn the top-level returned view into an imperative rerender
					body.
				</p>
				<p>
					For an ordinary initialization declaration whose safe result has only one view consumer,
					the compiler may elide the standalone derived cell when the result is scalar or merely
					forwards an existing identity. This is an emitted-code optimization: the authored
					initialization declaration remains its source definition for inspection. A leaf consumer
					inside a JSX conditional keeps the calculation at that leaf, so its updates do not
					invalidate the enclosing structural range. Shared values, fresh identity allocations,
					event or task consumers, and explicit reactive values keep their durable cells.
				</p>
			</section>
			<section>
				<h2>Pass a reactive value to another API</h2>
				<p>
					The public <code>this.reactive()</code> API creates the component-owned boundary
					deliberately. Use it when you want a first-class reactive value, need to pass that value
					through another framework API, or want the boundary to remain explicit rather than
					eligible for inferred cell elision.
				</p>
				<CodeBlock source={explicitDerivedSource} language="tsx" title="Explicit derived value" />
				<p>
					A task function can accept the derived value as an ordinary argument. Calling it during
					initialization records that argument expression as the activation dependency without
					another registration API.
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
					When an assignment in the component body reads reactive state, props, or shared context,
					the compiler treats the right side as a repeatable calculation and the state target as its
					output. There is no need to wrap an assignment-only calculation in a task function.
				</p>
				<CodeBlock source={derivedAssignmentSource} language="tsx" title="Summary.tsx" />
				<p>
					An assignment with no reactive inputs remains ordinary one-time initialization. Use
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
					boundary. Selecting a collection dynamically, such as{' '}
					<code>rows[index].set(key, value)</code>, has the same restriction in both named function
					tasks and arrow tasks.
				</p>
				<p>
					Ordinary DOM event callbacks publish their synchronous writes as one transaction. The
					runtime snapshots and deduplicates affected consumers before patching, so replacing a
					large reactive collection does not repeatedly update a component merely because it reads
					several changed entries. Interactive consequences patch before the callback returns;
					normal and deferred work keeps its scheduled host turn. Use an explicit{' '}
					<code>batch()</code>
					only when an external integration needs to define that same boundary itself.
				</p>
			</section>
			<section>
				<h2>Use derived values in child components</h2>
				<div theme:surface="raised" className="definition-grid">
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
					and Set uniqueness are preserved. Failed atomic batches restore insertion order, and
					rollback keeps observers connected without overwriting newer authoritative entries.
				</p>
				<p>
					Read-only helpers can accept <code>ReadonlyMap</code> or <code>ReadonlySet</code>. These
					types, including aliases, preserve the collection methods&apos; client/server placement.
					The annotation restricts mutation without copying the collection.
				</p>
				<CodeBlock source={collectionSource} language="tsx" title="Selection.tsx" />
				<p>
					Maps and Sets are encoded for SSR, hydration, and server operations and restored as real
					collections, including nested values in whole-page hydration and independent islands.
					Server continuations return ordered entry deltas instead of the complete collection.
					Transported Map keys may be null, booleans, finite numbers, or strings; local collections
					may still use object keys. Hydration accepts native collections without custom iteration
					or JSON serialization hooks.
				</p>
			</section>
		</Article>
	);
}

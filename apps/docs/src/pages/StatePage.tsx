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

export function StatePage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="State that reads like state"
			description="Read a field when you need it. Assign to it when something changes. Safe derived constants stay cached and update their consumers precisely."
			previous={{ path: '/learn/components', label: 'Components' }}
			next={{ path: '/learn/lists', label: 'Keyed lists' }}
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
				<h2>What the inferred form means</h2>
				<p>
					For a safe setup constant such as <code>subtotal</code>, the compiler emits an internal
					lazy derived value. The public <code>this.reactive()</code> API expresses the same
					relationship when you want to name the boundary yourself, work without the transform, or
					register a component-owned task through its <code>.task()</code> shorthand.
				</p>
				<CodeBlock source={explicitDerivedSource} language="tsx" title="Explicit derived value" />
				<p>
					The shorthand is specific to values returned by <code>this.reactive()</code>. A base
					<code>ReactiveValue</code> from <code>@exactjs/reactive</code> does not expose{' '}
					<code>.task()</code>; pass it to <code>this.task(value, work)</code> instead. The two
					component forms register the same dependency relationship.
				</p>
				<p>
					The explicit form is not “more reactive” than the inferred form. It is the visible
					spelling of a boundary the compiler can normally derive from the code.
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
					<p>Abort and rerun owned work when an explicit dependency changes.</p>
					<code>Context</code>
					<p>Carry reactive configuration or data through descendants without prop plumbing.</p>
				</div>
			</section>
		</Article>
	);
}

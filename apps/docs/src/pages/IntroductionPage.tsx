import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { CounterDemo } from '../demos/CounterDemo.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const counterSource = `import type { Component } from '@exactjs/core';

type CounterState = {
  count: number;
  lastChanged: string;
};

export function CounterDemo(this: Component<CounterState>) {
  // Setup runs once for this component instance.
  this.state.count = 0;
  this.state.lastChanged = 'Nothing has changed yet.';

  // The compiler turns this pure expression into a lazy reactive value.
  const doubled = this.state.count * 2;

  const change = (amount: number) => {
    this.state.count += amount;
    this.state.lastChanged =
      \`Only the count cells changed at \${new Date().toLocaleTimeString()}.\`;
  };

  return () => (
    <section className="demo counter-demo" aria-label="Interactive counter example">
      <div>
        <p className="demo-kicker">Live eXact component</p>
        <strong className="counter-value">{this.state.count}</strong>
        <span className="counter-derived">twice that is {doubled}</span>
      </div>

      <div className="button-row">
        <button type="button" onClick={() => change(-1)}>−1</button>
        <button type="button" onClick={() => change(1)}>+1</button>
        <button
          type="button"
          onClick={() => {
            this.state.count = 0;
            this.state.lastChanged = 'Back at the starting point.';
          }}
        >
          Reset
        </button>
      </div>

      <p className="demo-status" aria-live="polite">
        {this.state.lastChanged}
      </p>
    </section>
  );
}`;

/** Introduces eXact's setup-once, compiler-led reactive web framework model. */
export function IntroductionPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Welcome to eXact"
			title="Write the component. Do not rerun it."
			description="eXact is a compiler-led web framework built around long-lived TypeScript components, precise reactive updates, and automatic client/server coordination. Component setup runs once; the expressions that depend on changing state stay connected."
			next={{ path: '/story', label: 'The story behind eXact' }}
		>
			<section className="sudoku-showcase">
				<div>
					<p className="demo-kicker">Built with eXact</p>
					<h2>See the model at play.</h2>
					<p>
						Sudoku Atelier turns direct state, precise updates, tasks, persistence, responsive
						layout, full theming, and steady one-pass board derivation into one polished
						application.
					</p>
				</div>
				<a className="primary-link" href="./sudoku.html">
					Play Sudoku Atelier <span aria-hidden="true">{'\u2192'}</span>
				</a>
			</section>

			<section>
				<h2>Why another web framework?</h2>
				<p>
					React is the current center of gravity for web interfaces, and for good reason: its
					component model is expressive, its ecosystem is enormous, and Hooks made stateful
					composition feel like ordinary function calls. But Hooks are not ordinary calls. Their
					meaning depends on stable execution order, and every render calls the component again to
					produce another description of the interface.
				</p>
				<p>
					That also means a function component has no durable, inspectable component object
					containing its state. React owns that state behind the Hook dispatcher. Testing visible
					behavior is excellent discipline, but it does not make internal state irrelevant: when a
					component misbehaves, being able to inspect its actual state, tasks, and resources is
					useful for tests, diagnostics, and plain old debugging.
				</p>
				<p>
					React calls component functions repeatedly to produce a new description of the interface.
					Given that need to continually rerender components, the virtual DOM is an effective
					general solution, but it comes at a cost: run the render logic, create the next
					description, compare it with the previous one, then commit the necessary changes. As
					components grow, identity-sensitive work, side effects, and expensive calculations
					increasingly move into Hooks and memoization so repeated execution remains safe. eXact
					asks what the source could look like if that repeated execution were unnecessary.
				</p>
			</section>

			<section>
				<h2>The alternatives move the tradeoff</h2>
				<div className="card-grid">
					<div className="topic-card">
						<span className="topic-index">React</span>
						<strong>Familiar JSX, positional state</strong>
						<p>
							Hooks compose elegantly, but their order is part of the runtime protocol and state
							remains indirectly owned by React.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Vue</span>
						<strong>Reactivity, with another authoring model</strong>
						<p>
							Vue makes reactivity central, but its primary view language is templates and primitive
							refs are boxed, requiring <code>.value</code> in TypeScript even where templates
							unwrap them.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Svelte</span>
						<strong>Compilation, with a framework dialect</strong>
						<p>
							Svelte avoids a virtual DOM, but runes such as <code>$state</code>,{' '}
							<code>$derived</code>, and <code>$effect</code> make reactivity a distinct syntax to
							learn and recognize.
						</p>
					</div>
				</div>
			</section>

			<Callout title="The eXact sweet spot" tone="tip">
				<p>
					Keep TSX. Keep direct, inspectable state on a long-lived component. Let a compiler connect
					each state read to the DOM, task, or server operation that depends on it. The source stays
					small and understandable while the generated program handles subscriptions, cleanup,
					placement, transport, and updates.
				</p>
			</Callout>

			<section className="hero-grid">
				<div className="hero-copy">
					<p className="demo-kicker">See the model</p>
					<h2>One setup, precise updates</h2>
					<p>
						Use the controls to change one state field. The displayed count and doubled value are
						separate reactive expressions. The component remains alive, its state remains
						inspectable, and its function does not run again after a click.
					</p>
					<div className="hero-actions">
						<Link className="primary-link" to="/learn/components">
							Understand the component <span aria-hidden="true">{'->'}</span>
						</Link>
						<Link className="secondary-link" to="/examples/logo-lab">
							Try a larger demo
						</Link>
					</div>
				</div>
				<CounterDemo />
			</section>

			<section>
				<h2>Here is the whole component</h2>
				<p>
					The component body is setup: initialize state, define derived values, register tasks, and
					assemble services. The returned function describes the view. State reads look like
					ordinary property access, but the compiler preserves them as independently connected
					update boundaries.
				</p>
				<CodeBlock source={counterSource} language="tsx" title="CounterDemo.tsx" />
			</section>

			<section>
				<h2>Why use this model?</h2>
				<div className="card-grid">
					<div className="topic-card">
						<span className="topic-index">State</span>
						<strong>Write normal-looking TypeScript</strong>
						<p>
							Read and assign instance state directly. Pure derived constants remain ordinary
							expressions in source.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Updates</span>
						<strong>Keep work local</strong>
						<p>
							The compiler gives text, props, styles, branches, and keyed collections their own
							update boundaries.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Lifetime</span>
						<strong>Give work an owner</strong>
						<p>
							Tasks, cancellation, disposable resources, context, refs, and cleanup belong to a
							long-lived component instance.
						</p>
					</div>
				</div>
			</section>

			<section>
				<h2>One readable model across client and server</h2>
				<p>
					eXact applies the same compiler-visible ownership to asynchronous and distributed work. A
					component can mix browser interaction with server operations without making transport code
					the organizing idea of the component. The compiler analyzes placement and produces the
					client and server artifacts, executable contracts, state transfer, and lifecycle
					boundaries needed to connect them.
				</p>
				<p>
					This is deliberate syntactic sugar: a small amount of familiar TypeScript expands into
					operations that would be complex and repetitive by hand. The generated machinery can be
					sophisticated without forcing the component source to become sophisticated too. State, DOM
					updates, async lifetime, server placement, and cleanup remain parts of one understandable
					component.
				</p>
				<Link className="secondary-link" to="/compare">
					See the detailed comparison
				</Link>
			</section>

			<section>
				<h2>Continue from the idea, not the installer</h2>
				<div className="card-grid">
					<Link className="topic-card" to="/learn/components">
						<span className="topic-index">01</span>
						<strong>Understand components</strong>
						<p>See setup, views, props, context, tasks, refs, and the complete instance surface.</p>
					</Link>
					<Link className="topic-card" to="/learn/state">
						<span className="topic-index">02</span>
						<strong>Follow reactivity</strong>
						<p>See what the compiler infers and how direct state becomes precise DOM work.</p>
					</Link>
					<Link className="topic-card" to="/plugins">
						<span className="topic-index">03</span>
						<strong>Explore the platform</strong>
						<p>
							Learn how plugins carry cross-cutting concerns through compiler and runtime hosts.
						</p>
					</Link>
				</div>
			</section>
			<section>
				<h2>Where it stands today</h2>
				<p>
					eXact is under active development. The docs distinguish implemented behavior from future
					direction, and the examples use the repository's current package workflow. That maturity
					affects adoption, but it is context for evaluating the framework rather than the
					framework's headline feature.
				</p>
			</section>
		</Article>
	);
}

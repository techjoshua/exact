import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { CounterDemo } from '../demos/CounterDemo.jsx';
import { Article } from './Article.jsx';

const counterSource = `import type { Component } from '@exactjs/core';

type CounterState = { count: number };

export function CounterDemo(this: Component<CounterState>) {
  // Default state for each new component instance.
  this.state.count = 0;

  // eXact updates this value when count changes.
  const doubled = this.state.count * 2;

  return () => (
    <section className="demo counter-demo" aria-label="Interactive counter example">
      <div>
        <p className="demo-kicker">Live eXact component</p>
        <strong className="counter-value">{this.state.count}</strong>
        <span className="counter-derived">twice that is {doubled}</span>
      </div>

      <button type="button" onClick={() => this.state.count++}>+1</button>
    </section>
  );
}`;

/** Introduces eXact's ordinary-TypeScript-to-reactive-state-machine component model. */
export function IntroductionPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Welcome to eXact"
			title="Build reactive apps with TypeScript"
			description="eXact compiles TypeScript and TSX into precise client and server updates. Components keep direct, inspectable state."
			next={{ path: '/getting-started', label: 'Quick start' }}
		>
			<section theme:surface="raised" className="hero-grid">
				<div className="hero-copy">
					<p className="demo-kicker">See the model</p>
					<h2>One instance, precise updates</h2>
					<p>
						Click the button to increase the count. The doubled value updates too because it is
						calculated from the count. Each mounted counter keeps its own state, and eXact updates
						the parts of its view that read the changed value.
					</p>
					<div className="hero-actions">
						<Link theme:action="primary" className="primary-link" to="/learn/components">
							Understand the component <span aria-hidden="true">{'->'}</span>
						</Link>
						<Link theme:action="secondary" className="secondary-link" to="/examples/logo-lab">
							Try a larger demo
						</Link>
					</div>
				</div>
				<CounterDemo />
			</section>

			<section>
				<h2>Here is the whole component</h2>
				<p>
					The example defines state in the component body and returns a function describing its
					view. Clicking the button changes the count. eXact updates the expressions that read that
					count, while the mounted component keeps its state. The compiler analyzes the body to
					connect these relationships; component-body declarations can describe reactive work.
				</p>
				<CodeBlock source={counterSource} language="tsx" title="CounterDemo.tsx" />
			</section>

			<section>
				<h2>Why use this model?</h2>
				<div className="card-grid">
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">State</span>
						<strong>Write normal-looking TypeScript</strong>
						<p>
							Read and assign instance state directly. Pure derived constants remain ordinary
							expressions in source.
						</p>
					</div>
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Updates</span>
						<strong>Update only what changed</strong>
						<p>
							The compiler gives text, props, styles, branches, and keyed collections their own
							update boundaries.
						</p>
					</div>
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Lifetime</span>
						<strong>Keep work tied to the component</strong>
						<p>Tasks, resources, context, refs, and cleanup share the component lifetime.</p>
					</div>
				</div>
			</section>

			<section>
				<h2>One readable model across client and server</h2>
				<p>
					A component can display server data and respond to browser events. You write the related
					work together, and the compiler determines which parts can run in each environment. Later
					guides introduce server tasks, rendering HTML on the server, and connecting that HTML to a
					live component in the browser.
				</p>
				<p>
					Start with <a href="#/getting-started">a working application</a>, then learn about
					components and state. The <a href="#/react-developers">React comparison</a> explains
					differences through familiar examples. The <a href="#/story">story behind eXact</a>
					describes the design’s origins.
				</p>
			</section>

			<section>
				<h2>Learn more about eXact</h2>
				<div className="card-grid">
					<Link
						theme:surface="raised"
						theme:interactive
						className="topic-card"
						to="/learn/components"
					>
						<span className="topic-index">01</span>
						<strong>Understand components</strong>
						<p>Learn about initialization, views, props, events, context, and refs.</p>
					</Link>
					<Link theme:surface="raised" theme:interactive className="topic-card" to="/learn/state">
						<span className="topic-index">02</span>
						<strong>Follow reactivity</strong>
						<p>Learn how direct state updates derived values and the DOM.</p>
					</Link>
					<Link theme:surface="raised" theme:interactive className="topic-card" to="/plugins">
						<span className="topic-index">03</span>
						<strong>Explore the platform</strong>
						<p>
							Learn how plugins carry cross-cutting concerns through compiler and runtime hosts.
						</p>
					</Link>
				</div>
			</section>
			<section>
				<h2>What eXact supports today</h2>
				<p>
					eXact already connects the major parts of an application through one compiler-led model:
				</p>
				<ul>
					<li>
						Clear, easy-to-follow syntax compiled into an optimized, reactive JavaScript state
						machine with continuations that span client and server.
					</li>
					<li>A familiar JSX dialect that gets out of your way.</li>
					<li>Durable components with direct, deeply reactive state.</li>
					<li>Derived values and precise DOM, prop, branch, and keyed-list updates.</li>
					<li>Owned tasks with cancellation, scheduling, optimistic state, and Suspense.</li>
					<li>
						Server rendering, hydration, client islands, server tasks, and compiler-planned server
						execution.
					</li>
					<li>Routing, reactive forms, component testing, and React compatibility.</li>
					<li>
						Open enhancements for accessibility, internationalization, motion, gestures, and more.
					</li>
					<li>Vite, Webpack, Bun, precompiled builds, and portable server adapters.</li>
					<li>Compiler-aware VS Code tooling and Chromium runtime DevTools.</li>
				</ul>
			</section>
			<section theme:surface="raised" className="sudoku-showcase">
				<div>
					<p className="demo-kicker">Built with eXact</p>
					<h2>See eXact in action</h2>
					<p>
						Sudoku Atelier combines direct state, tasks, persistence, responsive layout, theming,
						motion, and gestures in a complete application.
					</p>
				</div>
				<a theme:action="primary" className="primary-link" href="./sudoku.html">
					Play Sudoku Atelier <span aria-hidden="true">{'\u2192'}</span>
				</a>
			</section>
		</Article>
	);
}

import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { CounterDemo } from '../demos/CounterDemo.jsx';
import { Article } from './Article.jsx';
import { taskSources } from './task-sources.js';

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
			title="Build the page. Keep its moving parts connected."
			description="Getting a page on screen is straightforward. Keeping it correct as people interact with it takes more work. eXact helps with that coordination."
			next={{ path: '/getting-started', label: 'Quick start' }}
		>
			<section>
				<h2>What happens after the first render?</h2>
				<p>
					A user changes a search before its response arrives. A component disappears while its
					request is running. A displayed total needs to follow an edited quantity. Each feature
					brings relationships that must keep working as the page changes.
				</p>
				<p>
					eXact is a TypeScript and TSX framework that takes care of much of that coordination. Its
					compiler connects state to the view and tasks that depend on it, ties work to the
					component that owns it, and generates communication for server tasks. It also helps
					library authors package reusable components and lets applications control which libraries
					run on their server. The examples below show how these pieces support application
					development.
				</p>
			</section>
			<section theme:surface="raised" className="hero-grid">
				<div className="hero-copy">
					<p className="demo-kicker">Start with state</p>
					<h2>One instance, precise updates</h2>
					<p>
						Click the button to increase the count. The doubled value updates too because it is
						calculated from the count. Each mounted counter keeps its own state, and eXact updates
						the parts of its view that read the changed value.
					</p>
					<div className="hero-actions">
						<Link theme:action="primary" className="primary-link" to="/getting-started">
							Create your first app <span aria-hidden="true">{'->'}</span>
						</Link>
						<Link theme:action="secondary" className="secondary-link" to="/story">
							Why I built eXact
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
				<h2>Keep a search in step with its input</h2>
				<p>
					A search box has more to coordinate than its text. A user can change the query while a
					request is running, and an older response can arrive after a newer one. Leaving the page
					should also stop the work that belonged to it.
				</p>
				<p>
					In eXact, a task is work owned by a component. Calling it in the component body connects
					it to its inputs. This excerpt runs a search when <code>query</code> changes:
				</p>
				<CodeBlock
					source={taskSources.reactiveTaskSource}
					language="tsx"
					title="A search task inside a component"
				/>
				<p>
					The <code>search(this.state.query)</code> call tells the compiler what should start a new
					run. When the query changes, eXact cancels the previous run. The signal cancels its fetch,
					and an outdated run cannot publish its results into the current component state. Removing
					the component cancels its task too.
				</p>
				<p>
					The application supplies <code>SearchState</code>, the input and results view, and the
					<code>/api/search</code> endpoint. eXact supplies the task lifetime and connects the
					result assignment to the view. The <a href="#/learn/tasks">task guide</a> explains status,
					error handling, and how to choose which changes trigger work.
				</p>
			</section>
			<section>
				<h2>Keep the client and server parts of a feature together</h2>
				<p>
					A feature can include a form, server data, and the state displayed when a request
					finishes. Define its browser and server tasks alongside the view so you can follow the
					behavior in one place. Shared services can still live in ordinary modules and serve
					several components.
				</p>
				<p>
					A shipping calculator needs private carrier credentials to request prices. Its browser
					interface still needs to show each result and react when the shipment changes. The
					shipping sample defines this task inside its calculator component:
				</p>
				<CodeBlock
					language="tsx"
					title="Excerpt from the shipping calculator"
					source={`function quoteProviderOnServer(
  id: ProviderId,
  request: RateRequest,
  task: TaskContext = TaskContext.server()
) {
  return quoteProvider(id, request, task.signal);
}`}
				/>
				<p>
					Browser-side work in that component can await{' '}
					<code>quoteProviderOnServer(id, request)</code>. The compiler generates the request and
					response handling. The carrier helper and its credentials stay on the server, while the
					permitted quote data returns to the browser. Server requests can invoke only
					compiler-registered operations, and the runtime validates data crossing that boundary. The
					application supplies its providers, authenticates users, checks their access to data, and
					configures the server host.
				</p>
				<p>
					Read <a href="#/learn/server-execution">how server tasks work</a> or explore the
					<a href="https://github.com/techjoshua/exact/tree/main/apps/shipping-calculator">
						complete shipping calculator
					</a>
					.
				</p>
			</section>
			<section>
				<h2>Do less work, and start ready work sooner</h2>
				<p>
					The compiler's knowledge of dependencies also helps with performance. In the browser,
					changing state schedules the expressions and DOM regions that read it. On the server,
					independent tasks can overlap while waiting for data.
				</p>
				<p>
					During server-side rendering (SSR), eXact tracks when a task's inputs become available.
					Ready tasks start immediately when a request's concurrency slot is free. On supported
					compiled component paths, reachable child work can begin before earlier tasks finish. For
					example, two independent panels can load their data at the same time while the renderer
					keeps their HTML in page order. Tasks still wait for inputs they actually need, and
					inactive branches do not start work.
				</p>
				<p>
					A busy server also needs time to receive requests and send responses. The Node adapter
					monitors event-loop delay and completed-response throughput. It can schedule rendering
					starts in bounded batches and yield so network I/O can progress. This balances rendering
					with the rest of the server's work under load.
				</p>
				<p>
					See the <a href="#/performance">performance charts</a> for measured response times, memory
					use, throughput, and the conditions behind each comparison. Results depend on the
					application and host; the charts measure complete workloads rather than attributing a
					particular speedup to one mechanism.
				</p>
			</section>
			<section>
				<h2>Share a component and let each application choose its capabilities</h2>
				<p>
					Suppose you publish a chart with optional motion. An enhancement adds that behavior to its
					elements. The consuming application chooses whether to enable the enhancement; with motion
					disabled, the chart's underlying content remains available.
				</p>
				<p>
					Build the library with <code>exactc build-library</code>. It produces client and server
					modules, TypeScript declarations, and the metadata consuming builds use to check the
					package. Optional enhancements retain that application-controlled behavior after
					publication.
				</p>
				<p>
					Installing a component library also raises a server question: should this package be
					allowed to execute there? The application can authorize packages, version ranges, or
					trusted scopes and deny others. Authorized libraries run with the server process's
					permissions, so reviewing their code and dependencies remains part of adopting them.
				</p>
				<p>
					See <a href="#/components/trust">building and authorizing libraries</a> and
					<a href="#/components/enhancements">optional enhancements</a> for configuration and
					examples.
				</p>
			</section>
			<section>
				<h2>Less plumbing to maintain</h2>
				<p>
					Taken together, these features let you keep a component's behavior connected without
					manually maintaining all the connections:
				</p>
				<ul>
					<li>No dependency arrays to keep derived values and reactive tasks current.</li>
					<li>
						No API endpoint and matching client request wrapper to write for each component's server
						task.
					</li>
					<li>
						No GraphQL schema and resolvers required just to connect those tasks to server code.
					</li>
					<li>
						No task-lifetime bookkeeping or stale-result guards for compiler-managed state updates.
					</li>
					<li>No custom compiler pipeline to assemble to publish a supported component library.</li>
				</ul>
				<p>
					You still describe the task inputs, choose policies when needed, and implement business
					logic, authentication, and access rules. Existing APIs and GraphQL services can remain
					part of the application. eXact handles the connections it understands, leaving you more
					time for the behavior your users need.
				</p>
			</section>
			<section>
				<h2>Try one component first</h2>
				<p>
					Create the browser starter, change its counter, and add a derived value such as
					<code>const doubled = this.state.count * 2</code>. Display it beside the count and watch
					both update. Then try a task that responds to an input. You can explore the component
					model before configuring a server.
				</p>
				<div className="hero-actions">
					<Link theme:action="primary" className="primary-link" to="/getting-started">
						Create your first app
					</Link>
					<Link theme:action="secondary" className="secondary-link" to="/story">
						Why I built eXact
					</Link>
				</div>
				<p>
					eXact is experimental and its public APIs may change. It requires the eXact compiler, and
					familiar TSX has its own component and task semantics to learn. Start with a small feature
					you can evaluate independently. If you need existing React libraries, check the
					<a href="#/guides/react-compatibility">compatibility guide</a> for supported behavior and
					limits. Check the <a href="#/runtimes">runtime guide</a> for your deployment target.
				</p>
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

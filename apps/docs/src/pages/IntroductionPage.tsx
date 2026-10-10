import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { App as SearchDemo } from '../demos/SearchDemo.jsx';
import searchSource from '../demos/SearchDemo.tsx?raw';
import { Article } from './Article.jsx';

const quoteSource = `// Inside a component with a server-provided carrier service:
async function quote(
  address: Address,
  task: TaskContext = TaskContext.server()
) {
  this.state.quote = await carrier.quote(address, task.signal);
}

// A new address starts a new quote and cancels the obsolete one.
quote(this.state.address);`;

/** Introduces framework benefits before teaching the component model through a runnable example. */
export function IntroductionPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Welcome to eXact"
			title="Make interactive applications easier to get right"
			description="eXact is a compiler-led TypeScript and TSX web framework. It connects state, UI, and server work, reducing coordination code."
			next={{ path: '/getting-started', label: 'Quick start' }}
		>
			<section>
				<p>
					Growing applications need more coordination: keeping requests current, connecting browser
					and server, translating content, and combining teams’ code. eXact handles much of that
					coordination so your components focus on features, with ordinary TypeScript and
					inspectable state.
				</p>
				<h2>What eXact takes care of</h2>
				<ul>
					<li>
						<strong>Focused updates.</strong> Change state directly. The compiler updates only the
						calculations and DOM that depend on it.
					</li>
					<li>
						<strong>Async work that stays current.</strong> Component-owned
						<a href="#/learn/tasks"> tasks</a> track status, cancel obsolete work, block stale
						results, and clean up on removal.
					</li>
					<li>
						<strong>Browser and server coordination.</strong> Components can define both
						<a href="#/learn/server-execution"> client and server tasks</a>. The compiler handles
						transport and checks which data may cross the boundary.
					</li>
					<li>
						<strong>Localization in your TSX.</strong> Mark translatable TSX with
						<a href="#/plugins/internationalization"> localization enhancements</a>. Build tools
						extract messages, validate catalogs, and infer supported plurals and formats for dates,
						currencies, and units.
					</li>
					<li>
						<strong>Reusable HTML behavior.</strong> Write your own
						<a href="#/components/enhancements"> enhancements</a> as components and attach them to
						semantic HTML.
					</li>
					<li>
						<strong>Named, server-owned secrets.</strong> The optional
						<a href="#/plugins/secrets"> secrets plugin</a> loads credentials from configured
						providers and keeps them out of client configuration.
					</li>
					<li>
						<strong>Explicit component authorization.</strong> Choose which
						<a href="#/components/trust"> component libraries</a> may execute on your server. The
						compiler and runtime enforce that policy across component composition.
					</li>
					<li>
						<strong>Independent team delivery.</strong> The optional
						<a href="#/plugins/microfrontends"> microfrontend integration</a> lets teams build and
						deploy page sections separately, sharing runtime capabilities with explicit ownership.
					</li>
				</ul>
				<p>
					Start with components and add capabilities as needed. You own business logic,
					authentication, and access rules. eXact handles the coordination shown below.
				</p>
				<div className="hero-actions">
					<Link theme:action="primary" className="primary-link" to="/getting-started">
						Create your first app
					</Link>
					<Link theme:action="secondary" className="secondary-link" to="/story">
						Why I built eXact
					</Link>
				</div>
			</section>
			<section>
				<h2>Keep search results current</h2>
				<p>
					Search responses can arrive out of order, showing results for an obsolete query. Keeping
					them current requires cancellation, loading status, stale-result protection, and cleanup.
				</p>
				<p>
					A <strong>task</strong> is a function whose runs belong to the component.
					<code>TaskContext</code> marks it as a task, and <code>search(this.state.query)</code>
					connects it to the query. Each change cancels the previous run and starts another.
					Cancelled runs cannot update component state.
				</p>
				<CodeBlock source={searchSource} language="tsx" title="src/App.tsx" />
				<p>
					State lives in <code>this.state</code>. The returned function describes the view.
					<code>value:onInput</code> updates the query as you type, and
					<code>taskStatus(search)</code> provides loading status. The example searches a local list
					with simulated latency, so it runs in the browser starter without a service.
				</p>
				<p>
					Enter <code>p</code>, then add <code>a</code> while “Searching…” is visible.
					<code>p</code> takes 800 milliseconds and matches Paris and Portland. <code>pa</code>
					takes 200 milliseconds and matches only Paris. When the older search finishes, Portland
					should stay hidden.
				</p>
				<div theme:surface="raised" className="demo">
					<SearchDemo />
				</div>
				<p>
					The timer finishes after cancellation to demonstrate stale-result protection. For real
					requests, pass the task’s <code>signal</code> to your data client to stop I/O too.
					Removing the component cancels its work. The
					<a href="#/learn/tasks">task guide</a> covers errors, concurrency, and cleanup.
				</p>
			</section>
			<section>
				<h2>Call server code directly</h2>
				<p>
					A shipping quote needs private credentials, while its form lives in the browser.
					Connecting them usually means maintaining an endpoint, request and response types, a
					client wrapper, and cancellation logic.
				</p>
				<p>
					The component calls the quote service directly. The compiler extracts server work into a
					<strong>continuation</strong>, a server-executed portion of the task, and handles
					transport. Inputs reach the server, permitted results and state changes return, and
					credentials stay private.
				</p>
				<CodeBlock source={quoteSource} language="tsx" title="Excerpt: a shipping quote task" />
				<p>
					Here <code>carrier</code> is a service supplied by the server, and <code>Address</code>
					is the application's input type. The <a href="#/learn/server-execution">server guide</a>
					shows how to provide that service and declare which results may reach the browser.
				</p>
				<p>
					The feature stays readable: read the address, request a quote, show the result. Services
					can live in shared modules. You provide authentication and access rules. eXact handles
					transport and task lifetime.
					<a href="#/learn/server-execution">Explore server tasks</a> or read the
					<a href="https://github.com/techjoshua/exact/tree/main/apps/shipping-calculator">
						shipping sample
					</a>
					.
				</p>
			</section>
			<section>
				<h2>Update precisely and load concurrently</h2>
				<p>
					Changing a cart quantity should update its total. eXact tracks state dependencies and
					updates the affected calculations and DOM directly, without manual memoization.
				</p>
				<p>
					A product page can load its product and recommendations together. During server rendering,
					eXact starts tasks when inputs are ready and scheduling capacity is available. Independent
					requests run concurrently across components, while HTML stays in page order. You need no
					shared loader to coordinate them.
				</p>
				<p>
					On Node, eXact adjusts rendering concurrency based on event-loop load and response
					completion, helping the server send pages while rendering continues. See the
					<a href="#/performance">performance measurements</a> for results, test conditions, and
					scheduling limits.
				</p>
			</section>
			<section>
				<h2>Share components with less build work</h2>
				<p>
					Sharing a chart across applications requires packaging. <code>exactc build-library</code>
					builds client and server modules, TypeScript declarations, and package metadata from your
					components.
				</p>
				<p>
					Optional enhancements let consumers choose features, such as chart animations. Each
					application also approves which libraries may run on its server, with that process’s
					permissions. Learn about
					<a href="#/components/trust">library distribution and authorization</a> and
					<a href="#/components/enhancements">optional enhancements</a>.
				</p>
			</section>
			<section>
				<h2>Start with a small feature</h2>
				<p>
					Try the search example in the browser starter before adding a server or migrating a larger
					feature. Check <a href="#/runtimes">deployment support</a> and
					<a href="#/guides/react-compatibility">React compatibility</a> for your requirements.
				</p>
				<div className="hero-actions">
					<Link theme:action="primary" className="primary-link" to="/getting-started">
						Create your first app
					</Link>
					<a theme:action="secondary" className="secondary-link" href="./sudoku.html">
						Try Sudoku Atelier
					</a>
				</div>
			</section>
			<section>
				<p>eXact is experimental and its APIs may change.</p>
			</section>
		</Article>
	);
}

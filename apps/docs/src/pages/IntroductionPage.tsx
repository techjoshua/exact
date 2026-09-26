import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { App as SearchDemo } from '../demos/SearchDemo.jsx';
import searchSource from '../demos/SearchDemo.tsx?raw';
import { Article } from './Article.jsx';

/** Introduces the framework through one runnable example and links to its deeper guides. */
export function IntroductionPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Welcome to eXact"
			title="Make interactive applications easier to get right"
			description="Getting a page on screen is straightforward. Keeping it correct as people interact with it takes more work. eXact helps with that coordination."
			next={{ path: '/getting-started', label: 'Quick start' }}
		>
			<section>
				<p>
					A user changes a search before its response arrives. A component disappears while work is
					still running. A server operation needs private credentials. eXact connects these parts of
					an application through a compiler that understands component state, asynchronous work, and
					where that work can run. You describe the behavior with TypeScript and TSX.
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
				<h2>When the user types faster than the server responds</h2>
				<p>
					We’ve all built a search box that starts another request before the previous one finishes.
					Responses can arrive out of order, leaving results for text the user has already changed.
					You wire up cancellation, guard against late responses, track loading state, and remember
					to clean up when the user leaves the page. Every new keystroke puts that plumbing to work
					again.
				</p>
				<p>
					In eXact, you describe the search as a <strong>task</strong>: a function whose runs belong
					to the mounted component. The <code>TaskContext</code> parameter marks that work, and
					<code>search(this.state.query)</code> connects it to the query. When the query changes,
					eXact cancels the previous run and starts another. A cancelled run cannot publish its
					results into component state.
				</p>
				<CodeBlock source={searchSource} language="tsx" title="src/App.tsx" />
				<p>
					The component keeps its state in <code>this.state</code>. The returned function describes
					the view, and <code>value:onInput</code> writes the input’s value to the query as you
					type.
					<code>taskStatus(search)</code> supplies the loading indicator. This example searches a
					local list with simulated latency, so you can paste it into the browser starter without
					setting up a service.
				</p>
				<p>
					Try entering <code>p</code>, then add <code>a</code> while “Searching…” is visible. The
					search for <code>p</code> takes 800 milliseconds and matches Paris and Portland;
					<code>pa</code> takes 200 milliseconds and matches only Paris. Paris should stay on screen
					even after the older search finishes. Without protection against stale results, Portland
					could reappear under a query it no longer matches.
				</p>
				<div theme:surface="raised" className="demo">
					<SearchDemo />
				</div>
				<p>
					The timer deliberately finishes even after cancellation, so the demo exercises late-result
					protection. With a real request, pass the task’s <code>signal</code> to your data client
					so it can stop its I/O too. Removing the component cancels its work. The
					<a href="#/learn/tasks">task guide</a> covers errors, concurrency, and cleanup.
				</p>
			</section>
			<section>
				<h2>Call server code without writing the transport</h2>
				<p>
					A shipping quote needs private carrier credentials, but the address form lives in the
					browser. Even for this one feature, you can end up maintaining an endpoint, its request
					and response types, a client wrapper, and the logic that keeps the quote current as the
					address changes. A change to the form can require changes on both sides of that plumbing.
				</p>
				<p>
					In eXact, the component calls the quote service with an ordinary function call. When that
					work needs server resources, the compiler turns the server portion into a
					<strong>continuation</strong> and generates the communication needed to run it. Inputs go
					to the server; permitted results and state changes return to the component. Private
					carrier credentials stay on the server.
				</p>
				<p>
					That leaves the component describing the feature: read the address, request a quote, show
					the result. You can follow that flow in the code without tracing an endpoint and a client
					request wrapper, and change it without keeping those pieces in sync. Services can still
					live in shared modules. You provide authentication and access rules; eXact handles the
					transport and task lifetime.
					<a href="#/learn/server-execution">Explore server tasks</a> or read the
					<a href="https://github.com/techjoshua/exact/tree/main/apps/shipping-calculator">
						shipping sample
					</a>
					.
				</p>
			</section>
			<section>
				<h2>Do less work, and start ready work sooner</h2>
				<p>
					A small state change can lead to far more rendering work than the visible change needs. On
					the server, a different delay appears when independent data requests start one after
					another as rendering reaches each component. Neither extra computation nor that request
					waterfall helps the user get a usable page sooner.
				</p>
				<p>
					Browser updates target the expressions and DOM regions that depend on changed state.
					During server-side rendering (SSR), ready tasks start when their inputs and a concurrency
					slot are available. Supported compiled components can start independent child work before
					earlier tasks finish, while keeping HTML in page order. Real dependencies still control
					what can run.
				</p>
				<p>
					Under load, rendering also competes with the network I/O needed to deliver finished pages.
					The Node adapter adjusts rendering admission using event-loop delay and completed-response
					throughput, yielding so network I/O can progress under load. See the
					<a href="#/performance">measurements and scheduling limits</a> for results and conditions.
				</p>
			</section>
			<section>
				<h2>Publish components with application-controlled capabilities</h2>
				<p>
					A component that works in your app takes more care to ship as a library. Consumers need
					server and browser builds, useful types, and a choice about optional features such as
					animation. They also need to know when adopting a UI package allows its code to execute on
					their server.
				</p>
				<p>
					Publish a chart with optional motion, and let each application decide whether to enable
					it. <code>exactc build-library</code> produces client and server modules, declarations,
					and package metadata. Applications also authorize which component libraries may run on
					their server. Those libraries execute with the server process's permissions, so review
					remains part of adoption. Learn about
					<a href="#/components/trust">library distribution and authorization</a> and
					<a href="#/components/enhancements">optional enhancements</a>.
				</p>
			</section>
			<section>
				<h2>Less plumbing to maintain</h2>
				<p>These connections mean less work to write and keep correct:</p>
				<ul>
					<li>No dependency arrays for derived values and reactive tasks.</li>
					<li>No endpoint and client request wrapper for each component's server task.</li>
					<li>No GraphQL schema or resolvers required just to connect those tasks.</li>
					<li>
						No task-lifetime bookkeeping or stale-result guards for compiler-managed state updates.
					</li>
					<li>No custom compiler pipeline for a supported component library.</li>
				</ul>
				<p>
					You supply task inputs, business logic, authentication, and access rules. Existing APIs
					and GraphQL services can remain part of your application.
				</p>
			</section>
			<section>
				<h2>Start with a small feature</h2>
				<p>
					eXact is experimental and its APIs may change. Start with the browser starter and the
					search example above. Learn its component model before adding a server or migrating a
					larger feature. Check <a href="#/runtimes">deployment support</a> and
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
		</Article>
	);
}

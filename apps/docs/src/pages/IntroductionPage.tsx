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
				<h2>Try changing an input while work is running</h2>
				<p>
					Type <strong>l</strong>, then quickly add <strong>i</strong>. The first search is
					intentionally slower. Once the second finishes, its Lisbon result should stay in place.
					This demo searches a local list with simulated latency, so it needs no server or API key.
				</p>
				<div theme:surface="raised" className="demo">
					<SearchDemo />
				</div>
				<p>
					State belongs to the mounted component. A task is work owned by that component, and
					calling it in the component body connects it to its inputs. Here,
					<code>search(this.state.query)</code> starts a run initially and whenever the query
					changes. The previous run is cancelled. The view follows the task's status and current
					results.
				</p>
				<details>
					<summary>View the complete component and try it in your project</summary>
					<p>
						Replace <code>src/App.tsx</code> in the browser starter with this code.
					</p>
					<CodeBlock source={searchSource} language="tsx" title="src/App.tsx" />
				</details>
				<p>
					Removing the component cancels its work too. With a real request, pass the task's
					<code>signal</code> to your data client so it can stop its I/O. The
					<a href="#/learn/tasks">task guide</a> covers errors, concurrency, and cleanup.
				</p>
			</section>
			<section>
				<h2>Keep the client and server parts together</h2>
				<p>
					A shipping calculator can define its server quote task alongside the view and browser
					interactions that use it. The compiler generates the communication, keeps private carrier
					credentials on the server, and checks what data can cross the boundary. Shared services
					can still live in ordinary modules.
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
					Browser updates target the expressions and DOM regions that depend on changed state.
					During server-side rendering (SSR), ready tasks start when their inputs and a concurrency
					slot are available. Supported compiled components can start independent child work before
					earlier tasks finish, while keeping HTML in page order. Real dependencies still control
					what can run.
				</p>
				<p>
					The Node adapter also adjusts rendering admission using event-loop delay and
					completed-response throughput, yielding so network I/O can progress under load. See the
					<a href="#/performance">measurements and scheduling limits</a> for results and conditions.
				</p>
			</section>
			<section>
				<h2>Publish components with application-controlled capabilities</h2>
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

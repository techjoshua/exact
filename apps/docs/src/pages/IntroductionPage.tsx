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
			description="eXact is a compiler-led TypeScript and TSX web framework. It connects your state, interface, and server work so there is less coordination code to write and maintain."
			next={{ path: '/getting-started', label: 'Quick start' }}
		>
			<section>
				<p>
					As an application grows, the code around each feature grows too: keeping requests current,
					connecting browser and server, translating content, and composing code from several teams.
					eXact moves much of that repeated coordination into its compiler and runtime. Your
					components describe the feature in ordinary TypeScript, with state and work you can
					inspect.
				</p>
				<h2>What eXact takes care of</h2>
				<ul>
					<li>
						<strong>Focused updates.</strong> Change component state directly. The compiler connects
						it to the calculations and DOM that depend on it, without dependency arrays or manual
						memoization.
					</li>
					<li>
						<strong>Asynchronous work that stays current.</strong> Component-owned
						<a href="#/learn/tasks"> tasks</a> provide status, cancellation, stale-result
						protection, and cleanup when the component leaves the page.
					</li>
					<li>
						<strong>Browser and server coordination.</strong> Call
						<a href="#/learn/server-execution"> server tasks</a> from your component. The compiler
						generates their transport and checks which data may cross the boundary.
					</li>
					<li>
						<strong>Localization close to the content.</strong> Mark translatable TSX with
						<a href="#/plugins/internationalization"> localization enhancements</a>. Build tools
						extract messages, validate catalogs, and infer supported plural and formatting intent,
						including dates, currencies, and measurement units.
					</li>
					<li>
						<strong>Reusable behavior on ordinary elements.</strong> Write your own
						<a href="#/components/enhancements"> enhancements</a> as components, then attach that
						behavior to semantic HTML instead of introducing another wrapper for every feature.
					</li>
					<li>
						<strong>Named, server-owned secrets.</strong> The optional
						<a href="#/plugins/secrets"> secrets plugin</a> resolves credentials through configured
						providers, keeping secret values out of client configuration.
					</li>
					<li>
						<strong>Explicit component authorization.</strong> Choose which
						<a href="#/components/trust"> component libraries</a> may execute on your server.
						Compiler-generated provenance and runtime policy checks carry that decision through
						component composition.
					</li>
					<li>
						<strong>Independent delivery for larger teams.</strong> The optional
						<a href="#/plugins/microfrontends"> microfrontend integration</a> lets teams build and
						deploy parts of a page separately, with shared runtime capabilities and explicit
						component ownership.
					</li>
				</ul>
				<p>
					Start with the component model, then add the capabilities your application needs. Your
					business logic, authentication, and access rules remain yours. The example below shows how
					much coordination one small feature can hand to the framework.
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
					search for <code>p</code> takes 800 milliseconds and matches Paris and Portland.
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
					to the server. Permitted results and state changes return to the component. Private
					carrier credentials stay on the server.
				</p>
				<CodeBlock source={quoteSource} language="tsx" title="Excerpt: a shipping quote task" />
				<p>
					Here <code>carrier</code> is a service supplied by the server, and <code>Address</code>
					is the application's input type. The <a href="#/learn/server-execution">server guide</a>
					shows how to provide that service and declare which results may reach the browser.
				</p>
				<p>
					That leaves the component describing the feature: read the address, request a quote, show
					the result. You can follow that flow in the code without tracing an endpoint and a client
					request wrapper, and change it without keeping those pieces in sync. Services can still
					live in shared modules. You provide authentication and access rules. eXact handles the
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
					Changing a quantity in a shopping cart should update the total without making the browser
					work through unrelated parts of the page. eXact’s compiler tracks which expressions use
					each piece of state. When the quantity changes, eXact updates the affected calculations
					and DOM directly. You get focused updates without manually adding memoization to keep the
					rest of the page from rerendering.
				</p>
				<p>
					On the server, imagine a page that loads a product and a list of recommendations. If both
					requests already have the inputs they need, waiting for the product response before
					starting recommendations adds unnecessary delay. During server rendering, eXact tracks
					when each task’s inputs are ready and starts the work as soon as scheduling capacity is
					available. Independent requests can run together, even across components, while the
					generated HTML stays in page order. That means less waiting for the page without manually
					reorganizing those requests into a shared loader.
				</p>
				<p>
					Handling more visitors also means giving the server time to send the pages it has
					finished. On Node, eXact monitors how busy the event loop is and how quickly responses
					complete, then adjusts how much rendering work it starts at once. This helps keep network
					traffic moving while rendering continues. See the
					<a href="#/performance">performance measurements</a> for results, test conditions, and
					scheduling limits.
				</p>
			</section>
			<section>
				<h2>Share components without maintaining a custom build pipeline</h2>
				<p>
					Once several applications use your chart, maintaining its packaging can become a project
					of its own. eXact provides <code>exactc build-library</code> to handle that work: it
					builds the client and server modules, TypeScript declarations, and package metadata from
					your component source. You can improve the chart without also maintaining your own
					compiler integration.
				</p>
				<p>
					Consumers can also have different requirements. One application may want animated charts.
					Another may want to leave out the animation code entirely. eXact’s optional enhancements
					let the same chart serve both, with each application choosing which features to enable.
					Applications also explicitly approve which component libraries may execute on their
					server, giving teams control over that part of adoption. Approval allows code to run with
					the server process’s permissions. Learn about
					<a href="#/components/trust">library distribution and authorization</a> and
					<a href="#/components/enhancements">optional enhancements</a>.
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

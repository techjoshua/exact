import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const routerSource = `import type { Child } from '@exactjs/core';
import { Router, type RouteDefinition } from '@exactjs/router';

function Layout(props: { children?: Child | Child[] }) {
  return () => <main><Navigation />{props.children}</main>;
}

const routes = [{
  render: outlet => <Layout>{outlet}</Layout>,
  children: [
    { index: true, render: () => <Home /> },
    { path: 'users/:id', render: () => <User /> },
    { path: '*', render: () => <NotFound /> }
  ]
}] satisfies readonly RouteDefinition[];

render(
  <Router basename="/app" routes={routes} />,
  document.getElementById('app')!
);`;

const publicationSource = `const publication = createViewTransitionCoordinator({
  name: (request) => request.kind === 'navigation' ? 'route' : undefined
});

const router = createExactRouter({ source, routes, publication });`;

const routeContextSource = `import type { Component } from '@exactjs/core';
import { RouteContext } from '@exactjs/router';

function UserPage(this: Component<{}>) {
  const route = this.getContext(RouteContext);
  const userId = route.params.id;
  const tab = route.searchParams().get('tab') ?? 'profile';

  const showHistory = () => {
    route.navigate('?tab=history', { replace: true });
  };

  return () => (
    <section>
      <h1>User {userId}</h1>
      <p>Current tab: {tab}</p>
      <button onClick={showHistory}>Show history</button>
    </section>
  );
}`;

const continuationNavigationSource = `import { TaskContext, type Component } from '@exactjs/core';
import { RouteContext } from '@exactjs/router';
import { saveReport } from './reports.server.js';

function NewReport(this: Component<{}>) {
  const route = this.getContext(RouteContext);

  async function createReport(task: TaskContext = TaskContext.server()): Promise<{ id: string }> {
    return saveReport();
  }

  async function openReport(task: TaskContext = TaskContext.client().latest()) {
    const result = await createReport();
    task.signal.throwIfAborted();
    if (!/^[A-Za-z0-9_-]+$/.test(result.id)) throw new Error('Invalid report ID');
    route.navigate('/reports/' + encodeURIComponent(result.id));
  }

  return () => <button onClick={() => void openReport()}>Create report</button>;
}`;

/** Documents nested routing, navigation, data loading, and server coordination. */
export function RoutingPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Build for the web"
			title="Routes are components too"
			description="Connect URLs to pages, add navigation links, and share layouts between routes."
			previous={{ path: '/learn/server-execution', label: 'Server execution' }}
			next={{ path: '/guides/forms', label: 'Accessible forms' }}
		>
			<section>
				<h2>Connect a URL to a page</h2>
				<p>
					A route selects a component for the current URL. A router watches the location and an
					outlet displays the selected page. Use links to let visitors move between routes. The
					example below adds a shared layout around those pages.
				</p>
			</section>
			<section>
				<h2>A nested application shell</h2>
				<CodeBlock source={routerSource} language="tsx" title="main.tsx" />
				<p>
					Each route's <code>render</code> callback receives its already-composed child output. The
					example passes that output to <code>Layout</code> as children. An index route supplies the
					default child. A route with its own path also renders at that path when none of its
					children match, and its parent host stays mounted as children appear or disappear.
				</p>
				<p>
					Named parameters capture URL segments. A question mark makes a parameter optional, so
					<code>:language?/about</code> matches both <code>/about</code> and <code>/en/about</code>.
					A splat captures the remaining path. Encoded slashes inside a captured value retain the
					original URL segment boundaries for relative routing.
				</p>
			</section>
			<section>
				<h2>Read the current route from context</h2>
				<p>
					Read route data through the component context. The component keeps its state as reactive
					route values change, and the view updates the expressions that use them.
				</p>
				<CodeBlock source={routeContextSource} language="tsx" title="UserPage.tsx" />
				<p>
					For developers familiar with React Router, <code>RouteContext</code> groups the common
					hook capabilities on one component-owned value.
				</p>
				<p>
					In React Router compatibility code, <code>HistoryRouter</code> subscribes to the supplied
					history through <code>listen()</code>. External pushes and replacements update the route
					and location hooks, including histories that mutate their location object in place. To
					inspect a location's route branch in compatibility code, <code>matchRoutes()</code>
					uses the complete basename prefix and returns <code>null</code> outside it. Unmounting
					releases the subscription.
				</p>
				<p>
					For links or form actions within modern React Router compatibility components, relative
					destinations start from the owning route. At a route whose path is
					<code>projects/:id/edit</code>, <code>useHref('details')</code> appends
					<code>/details</code> to its matched pathname. By default, <code>..</code> selects the
					parent route, skipping pathless layouts and index routes. Pass
					<code>{"{ relative: 'path' }"}</code> to <code>useHref()</code> or
					<code>useFormAction()</code> when <code>..</code> should remove one URL segment. The same
					option applies to link and form components, navigation, submission, and resolved paths.
					When inspecting a destination,
					<code>useResolvedPath()</code> returns route fields before basename or hash-router
					formatting. Use <code>useHref()</code> for a browser href. Absolute URLs and
					network-relative destinations such as
					<code>//example.com/guide</code> retain their destination. Cross-origin links use browser
					navigation.
				</p>
				<p>
					To submit data while keeping the current page in React Router compatibility code, render
					the <code>Form</code> returned by <code>useFetcher()</code>. Its inputs remain mounted
					while the request is pending and after it completes. The standalone <code>Form</code>
					uses navigation. GET submissions put the fields in the query, replacing any existing query
					and preserving the action's fragment. Fetcher destinations select their own loaders and
					actions while the calling component retains ownership of the request. Relative
					destinations start from its route. For a URL shared by a parent and index route, append a
					naked <code>?index</code> to select the index handler. Otherwise, the deepest route with a
					path handles the request. Replacing a request or unmounting its owner cancels pending
					work, and an older completion cannot overwrite newer fetcher data.
				</p>
				<p>
					An omitted form action targets its owning route and retains current query values. Explicit{' '}
					<code>.</code> targets the same route without retaining unrelated query values. Default
					index actions include index selection. <code>useFormAction()</code> returns a plain action
					path with the basename in both history and hash modes. Retained
					<code>useSubmit()</code> callbacks resolve the owning route when invoked. GET file fields
					contribute filenames, and GET fetchers keep index selection when form fields replace
					ordinary query values. Mutation submissions use URL-encoded fields by default. Choose
					multipart encoding for file contents, text encoding for line-separated fields, or JSON
					encoding for a field object. JSON keeps the last value for a repeated field name.
				</p>
				<p>
					When resolving route data for a server request in compatibility code,
					<code>createStaticHandler()</code> provides two ways to resolve data. Use its
					<code>query()</code> method to prepare a matched page's rendering context. Use
					<code>queryRoute()</code> to invoke one handler selected by the URL or a matching
					<code>routeId</code>. Route queries preserve returned responses and exact thrown values,
					and return redirects without loading their destinations. Both methods release their
					request-owned signals after success or failure. Canceled requests stop dispatch or reject
					pending queries without waiting for handlers that ignore cancellation.
				</p>
				<p>
					Await navigation or submission when your callback needs its result. Failed redirects and
					publication reject the promise and settle navigation state. Loader data becomes current
					when the history transition commits, and a rejected history write keeps the prior route
					data. A newer navigation or submission supersedes earlier work, which cannot replace the
					accepted location or route data. Route data lookup uses the route's own entry. Missing
					data stays absent even when an ID matches a standard object-property name. Published
					errors select their nearest boundary, including an explicitly thrown undefined value.
				</p>
				<div className="table-scroll route-api-scroll">
					<table className="route-api-table">
						<thead>
							<tr>
								<th>React Router hook</th>
								<th>eXact API</th>
								<th>Purpose</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>
									<code>useParams()</code>
								</td>
								<td>
									<code>route.params</code>
								</td>
								<td>Read parameters captured from the current path.</td>
							</tr>
							<tr>
								<td>
									<code>useLocation()</code>
								</td>
								<td>
									<code>route.location</code>
								</td>
								<td>Read the active pathname, query, hash, and navigation state.</td>
							</tr>
							<tr>
								<td>
									<code>useSearchParams()</code>
								</td>
								<td>
									<code>route.searchParams()</code>
								</td>
								<td>
									Read the current query through <code>URLSearchParams</code>.
								</td>
							</tr>
							<tr>
								<td>
									<code>useNavigate()</code>
								</td>
								<td>
									<code>route.navigate()</code>
								</td>
								<td>Start navigation from an interaction or task.</td>
							</tr>
							<tr>
								<td>
									<code>useHref()</code>
								</td>
								<td>
									<code>route.href()</code>
								</td>
								<td>Create an href for the router&apos;s location source and base path.</td>
							</tr>
							<tr>
								<td>
									<code>useMatches()</code>
								</td>
								<td>
									<code>route.matches</code>
								</td>
								<td>Inspect the matched route chain for the current location.</td>
							</tr>
						</tbody>
					</table>
				</div>
				<p>
					<code>Link</code> and <code>NavLink</code> provide navigation controls. An interaction or
					task can also call <code>route.navigate()</code> to navigate programmatically. Router
					cleanup methods and location fields follow ordinary TypeScript assignment rules. Editing a
					location observation does not navigate.
				</p>
			</section>
			<section>
				<h2>Choose URL, hash, or memory routing</h2>
				<p>
					During server rendering, history routes read the request URL and render their route
					callbacks in the request context. Static loaders receive incoming request headers and
					preserve GET or HEAD methods. Loader revalidation after an action uses GET and retains the
					headers. A direct <code>router.submit()</code> or <code>router.fetch()</code> call can
					include a caller <code>signal</code> in its request options. Cancellation rejects with
					that signal's reason and prevents late results from publishing, including redirects and
					revalidation started by that call. Loader hydration data must use plain JSON data fields.
					Getters and serialization hooks are rejected, and sparse array cells count against the
					graph budget. Shared sibling references serialize as copies, while cycles and configured
					resource limits are rejected.
				</p>
				<table className="docs-table">
					<thead>
						<tr>
							<th>Mode</th>
							<th>Good fit</th>
							<th>Important detail</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>History</td>
							<td>Apps with server rewrites</td>
							<td>Clean paths and direct SSR support</td>
						</tr>
						<tr>
							<td>Hash</td>
							<td>Static hosts such as GitHub Pages</td>
							<td>Refreshes need no rewrite</td>
						</tr>
						<tr>
							<td>Memory</td>
							<td>Tests and build-time rendering</td>
							<td>Deterministic and browser-free</td>
						</tr>
					</tbody>
				</table>
				<p>
					When creating a memory source, choose an integer initial index within its entries. Numeric
					navigation steps must be safe integers. Invalid steps are rejected before changing the
					current location.
				</p>
			</section>
			<section>
				<h2>Navigate after server work</h2>
				<CodeBlock source={continuationNavigationSource} language="tsx" title="NewReport.tsx" />
				<p>
					Return a typed result from server work, then navigate in a client task. The latest policy
					cancels superseded work. Check the task signal before changing location. Validate the
					identifier and construct an application path instead of accepting an arbitrary
					destination.
				</p>
				<p>
					For a full-document navigation, call <code>window.location.assign()</code> in that same
					client task. The request context value exposes <code>redirect()</code> to control its HTTP
					response. It validates the status, URL and Location header before changing response
					controls, so rejected input leaves the previous response intact. A redirect on a
					continuation fetch does not navigate the loaded page.
				</p>
			</section>
			<section>
				<h2>Keep navigation and state changes together</h2>
				<CodeBlock source={publicationSource} language="ts" title="router.ts" />
				<p>
					The optional coordinator runs after blockers and loaders succeed. It wraps exactly one
					authoritative publication and receives a rendered receipt, so motion can use native View
					Transitions without the router importing or depending on motion. If newer navigation
					supersedes a delayed publication, the old publication cannot move history.
				</p>
			</section>
		</Article>
	);
}

import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const routerSource = `function Layout() {
  // Outlet renders the child selected beneath this layout route.
  return () => <main><Navigation /><Outlet /></main>;
}

render(
  <Router basename="/app">
    {/* Child routes inherit the Layout component above. */}
    <Route component={Layout}>
      <Route index component={Home} />
      <Route path="users/:id" component={User} />
      {/* Keep the not-found rule last and local to this router. */}
      <Route path="*" component={NotFound} />
    </Route>
  </Router>,
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

/** Documents nested routing, navigation, data loading, and server coordination. */
export function RoutingPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Build for the web"
			title="Routes are components too"
			description="The native router matches component references, nests layouts through outlets, and runs against browser history, URL hashes, memory, or an ambient server request."
			previous={{ path: '/learn/devtools', label: 'Full-stack DevTools' }}
			next={{ path: '/guides/forms', label: 'Accessible forms' }}
		>
			<Callout title="You are looking at it" tone="tip">
				<p>
					This documentation shell uses <code>Router</code>, nested <code>Route</code> components,
					<code>Outlet</code>, <code>Link</code>, and <code>NavLink</code>. Active links follow each
					accepted location and expose <code>aria-current="page"</code> without remounting the
					shell.
				</p>
			</Callout>
			<section>
				<h2>A nested application shell</h2>
				<CodeBlock source={routerSource} language="tsx" title="main.tsx" />
			</section>
			<section>
				<h2>Read the current route from context</h2>
				<p>
					A routed component reads the nearest reactive <code>RouteContext</code>. Route parameters,
					location, query values, matches, href creation, and imperative navigation stay attached to
					the durable component instance rather than relying on positional hooks.
				</p>
				<CodeBlock source={routeContextSource} language="tsx" title="UserPage.tsx" />
				<div theme:surface="raised" className="definition-grid">
					<code>useParams()</code>
					<p>
						<code>route.params</code>
					</p>
					<code>useLocation()</code>
					<p>
						<code>route.location</code>
					</p>
					<code>useSearchParams()</code>
					<p>
						<code>route.searchParams()</code>
					</p>
					<code>useNavigate()</code>
					<p>
						<code>route.navigate()</code>
					</p>
					<code>useHref()</code>
					<p>
						<code>route.href()</code>
					</p>
					<code>useMatches()</code>
					<p>
						<code>route.matches</code>
					</p>
				</div>
				<p>
					Prefer <code>Link</code> and <code>NavLink</code> for navigation controls. Use
					<code>route.navigate()</code> when an interaction or task needs to navigate imperatively.
				</p>
			</section>
			<section>
				<h2>Choose a location source deliberately</h2>
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
			</section>
			<section>
				<h2>Coordinate only the publication boundary</h2>
				<CodeBlock source={publicationSource} language="ts" title="router.ts" />
				<p>
					The optional coordinator runs after blockers and loaders succeed. It wraps exactly one
					authoritative publication and receives a rendered receipt, so motion can use native View
					Transitions without the router importing or depending on motion.
				</p>
			</section>
		</Article>
	);
}

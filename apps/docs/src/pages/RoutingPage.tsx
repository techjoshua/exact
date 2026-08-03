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
					This documentation shell uses <code>Router</code>, nested <code>Route</code> components,{' '}
					<code>Outlet</code>, <code>Link</code>, and <code>NavLink</code>.
				</p>
			</Callout>
			<section>
				<h2>A nested application shell</h2>
				<CodeBlock source={routerSource} language="tsx" title="main.tsx" />
			</section>
			<section>
				<h2>Choose a location source deliberately</h2>
				<table>
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

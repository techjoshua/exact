import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import {
	compilerTourAuthoredSource,
	compilerTourContextSource
} from '../examples/compiler-tour.js';
import { Article } from './Article.jsx';

/** Explains how ordinary eXact source becomes precise runtime machinery. */
export function CompilerTourPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Inside the compiler"
			description="See how the compiler turns ordinary TypeScript into precise updates and coordinated server work."
			previous={{ path: '/learn/tasks', label: 'Tasks, dependencies & scheduling' }}
			next={{ path: '/learn/lists', label: 'Keyed lists' }}
		>
			<section>
				<h2>What you write</h2>
				<p>
					This example combines a server repository, deferred search, a browser effect, derived
					state, bindings, a conditional, and a keyed list.
				</p>
				<CodeBlock source={compilerTourAuthoredSource} language="tsx" title="CatalogEditor.tsx" />
				<p>
					The server runtime supplies this context. <code>@exact shared</code> allows the plain
					product data returned by <code>search()</code> to reach the browser.
				</p>
				<CodeBlock source={compilerTourContextSource} language="ts" title="catalog-context.ts" />
				<p>
					The server context and browser <code>document</code> access tell the compiler where each
					task runs.
				</p>
			</section>
			<section>
				<h2>What compilation adds</h2>
				<p>
					The compiler tracks which state feeds each attribute, text value, condition, binding, and
					list. A state change can update those destinations directly. It also separates client and
					server code, carries safe inputs, and connects server results to the component.
				</p>
				<p>
					Generated code imports compiled rendering and contract machinery through framework-owned
					Core subpaths. Those implementation capabilities are not part of the application-facing
					<code>@exactjs/core</code> root.
				</p>
			</section>
			<section>
				<h2>What to notice</h2>
				<p>
					Direct precompiled pipelines also use <code>rootDir</code> as an output-containment
					boundary. Inputs outside it are rejected before any path beneath <code>outDir</code> is
					derived or written. Client, server, shared, map, and inspection outputs are staged as one
					publication; a failed commit restores the previous generation.
				</p>
				<div className="card-grid">
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Precise updates</span>
						<strong>State updates its consumers</strong>
						<p>
							Direct state writes update the subtotal, bindings, text, and conditions that use them.
						</p>
					</div>
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">One task across the boundary</span>
						<strong>Tasks run where their resources live</strong>
						<p>
							The query runs on the server with cancellation. The title task runs in the browser.
						</p>
					</div>
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Stable identity and resumption</span>
						<strong>Keys preserve list items</strong>
						<p>
							The product type&apos;s <code>@exact key</code> annotation preserves rows as results
							change. SSR can finish the search before the browser adopts the page.
						</p>
					</div>
				</div>
			</section>
		</Article>
	);
}

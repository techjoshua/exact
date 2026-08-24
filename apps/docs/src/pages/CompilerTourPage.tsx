import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import {
	compilerTourAuthoredSource,
	compilerTourContextSource,
	compilerTourGeneratedClientSource,
	compilerTourGeneratedServerSource
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
				<h2>What the compiler generates</h2>
				<p>
					These are annotated pseudocode views of the current compiler contracts, not stable output
					for applications to import. Private helper names and opaque operation identities are
					shortened so the ownership and data flow are visible.
				</p>
				<h3>Browser artifact: state machine, DOM boundaries, and a transport stub</h3>
				<p>
					The browser keeps state defaults, precise reactive dependencies, bindings, event handlers,
					and the generated view. The server task becomes a continuation that sends only the query
					dependency selected by the compiler; the repository itself is absent.
				</p>
				<CodeBlock
					source={compilerTourGeneratedClientSource}
					language="ts"
					title="Generated browser artifact, annotated pseudocode"
				/>
				<h3>Server artifact: an allowlisted request executor</h3>
				<p>
					The server retains the executable task and resolves trusted context inside the current
					request. It injects cancellation, validates the shared result, and returns only the state
					projection that the browser applies to the same durable component instance.
				</p>
				<CodeBlock
					source={compilerTourGeneratedServerSource}
					language="ts"
					title="Generated server artifact, annotated pseudocode"
				/>
				<p>
					Generated code imports compiled rendering and contract machinery through framework-owned
					Core subpaths. Those implementation capabilities are not part of the application-facing
					<code>@exactjs/core</code> root.
				</p>
				<p>
					The exact representation is private, but the semantic contract is not: state consumers
					keep narrow update boundaries, server resources remain server-side, transport inputs are
					compiler-selected, and every task stays owned and cancelable.
				</p>
			</section>
			<section>
				<h2>What to notice</h2>
				<p>
					A component does not need a <code>.tsx</code> filename when it does not author JSX. The
					compiler recognizes native components in ordinary TypeScript modules too. Installed eXact
					libraries can provide precompiled browser and server artifacts, so applications consume
					the correct target without executing the compiler at runtime.
				</p>
				<p>
					Direct precompiled pipelines also use <code>rootDir</code> as an output-containment
					boundary. Inputs outside it are rejected before any path beneath <code>outDir</code> is
					derived or written. Client, server, shared, map, and inspection outputs are staged as one
					publication; a failed commit restores the previous generation.
				</p>
				<p>
					Editor compiler sessions bound native response time and settle cancellation immediately.
					If a native phase wedges, the next request starts a clean process and replays the last
					complete project synchronization.
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
							change. SSR can finish the search before the browser adopts the page, and generated
							component slots let it adopt native children without redundant wrapper markup.
						</p>
					</div>
				</div>
			</section>
		</Article>
	);
}

import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import {
	compilerTourAuthoredSource,
	compilerTourContextSource,
	compilerTourGeneratedClientSource,
	compilerTourGeneratedServerSource,
	compilerTourGeneratedViewSource
} from '../examples/compiler-tour.js';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

/** Explains how ordinary eXact source becomes precise runtime machinery. */
export function CompilerTourPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Inside the compiler"
			description="Follow one component across browser and server artifacts, from ordinary state and TSX to reactive DOM work and a compiler-generated protocol."
			previous={{ path: '/learn/tasks', label: 'Tasks, dependencies & scheduling' }}
			next={{ path: '/learn/lists', label: 'Keyed lists' }}
		>
			<section>
				<h2>What you write</h2>
				<p>
					This example deliberately combines several features that are easy to read in source but
					require careful ownership at runtime: a server-resident repository, a cancelable deferred
					search, a browser-only effect, derived state, typed two-way bindings, a conditional range,
					and keyed identity.
				</p>
				<CodeBlock source={compilerTourAuthoredSource} language="tsx" title="CatalogEditor.tsx" />
				<p>
					The component imports this ordinary context contract. The server runtime supplies its
					request-scoped database or API-backed value, while <code>@exact shared</code> allowlists
					only the plain product data returned by <code>search()</code>.
				</p>
				<CodeBlock source={compilerTourContextSource} language="ts" title="catalog-context.ts" />
				<p>
					The server context read and the browser <code>document</code> write give the compiler
					enough information to place both tasks. The author does not write transport code or
					manually duplicate the component.
				</p>
			</section>
			<section>
				<h2>What the compiler generates</h2>
				<p>
					This is a conceptual view of the current native compiler contracts, formatted and
					annotated for people rather than copied byte-for-byte from a build artifact. Unchanged
					type declarations are omitted, intermediate values are named where that clarifies
					sequencing, and opaque stable IDs are replaced with descriptive placeholders. Generated
					helper names and exact statement layout are private and may change.
				</p>
				<h3>Browser artifact: a continuation, not the repository</h3>
				<CodeBlock
					source={compilerTourGeneratedClientSource}
					language="ts"
					title="Generated browser setup, annotated"
				/>
				<h3>Server artifact: an allowlisted executor</h3>
				<p>
					The matching server artifact retains the repository import and executable search body. The
					request carries only compiler-selected public dependencies. The executor resolves trusted
					context locally, injects cancellation, validates the shared result, and returns the state
					projection that the browser runtime applies to the same component instance.
				</p>
				<CodeBlock
					source={compilerTourGeneratedServerSource}
					language="ts"
					title="Generated server executor, annotated"
				/>
			</section>
			<section>
				<h2>JSX becomes narrow reactive boundaries</h2>
				<p>
					Formatting the nested VNode calls makes the important division visible: an attribute, text
					expression, conditional range, binding, event, and keyed collection each retain their own
					reactive responsibility.
				</p>
				<CodeBlock
					source={compilerTourGeneratedViewSource}
					language="ts"
					title="Generated view, annotated"
				/>
			</section>
			<section>
				<h2>What to notice</h2>
				<div className="card-grid">
					<div className="topic-card">
						<span className="topic-index">Precise updates</span>
						<strong>Each dependency keeps a narrow destination</strong>
						<p>
							Direct state writes invalidate the derived subtotal, bindings, text, and conditional
							ranges that depend on them without rerunning the component.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">One task across the boundary</span>
						<strong>The compiler owns placement and cancellation</strong>
						<p>
							The query activates server work, cancellation is injected into the repository call,
							and trusted context stays server-side. The browser title task remains local.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Stable identity and resumption</span>
						<strong>Annotations remove repeated view ceremony</strong>
						<p>
							The product type&apos;s <code>@exact key</code> annotation preserves rows through
							ordinary map syntax. SSR can settle the same work and the browser adopts its DOM and
							public state.
						</p>
					</div>
				</div>
			</section>
			<Callout title="Generated code is an implementation contract, not an authoring API">
				<p>
					The helper names are private compiler/runtime coordination. Applications should use the
					authored form and rely on compiler diagnostics. The useful promise is semantic: precise
					dependencies, deterministic ownership, server isolation, cancellation, stable identity,
					and minimal updates.
				</p>
			</Callout>
		</Article>
	);
}

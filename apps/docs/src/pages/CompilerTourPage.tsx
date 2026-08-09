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
			title="What the compiler writes for you"
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
				<div className="definition-grid">
					<code>Component wrapper</code>
					<p>
						The exported function remains the durable component factory. Setup is not converted into
						a function that reruns after every state change.
					</p>
					<code>State writes</code>
					<p>
						Generated write helpers publish reactive invalidation while preserving direct assignment
						semantics and the assigned result.
					</p>
					<code>Derived subtotal</code>
					<p>
						The right-hand state reads become dependencies of an owned computation. The subtotal
						destination is an effect, not a dependency.
					</p>
					<code>Search task</code>
					<p>
						The query drives a deferred server generation. The browser dispatches an opaque
						continuation; the server resolves its repository context, and cancellation crosses the
						transport boundary.
					</p>
					<code>Server isolation</code>
					<p>
						The repository, credentials, database or API SDK, and their dependencies remain in the
						server artifact. Only the explicitly shared product data can return to client-visible
						state.
					</p>
					<code>Client task</code>
					<p>
						The title effect remains entirely in the browser artifact. Its use of
						<code>document</code> determines placement, while the compiler infers selected product
						name as its only dependency.
					</p>
					<code>Input bindings</code>
					<p>
						Namespaced values become a reactive DOM value plus the correctly typed intrinsic event
						write. Conversion for the number input is compiler-selected.
					</p>
					<code>Dynamic ranges</code>
					<p>
						Text and the conditional status receive narrow reactive computations and stable marker
						identity. They do not require a component rerender.
					</p>
					<code>Keyed products</code>
					<p>
						The map callback retains product identity by key while expressions inside each item keep
						their own reactive ownership.
					</p>
					<code>SSR and resumption</code>
					<p>
						The server artifact can settle the same continuation for the initial HTML. Its public
						state is resumed in the browser, so hydration adopts the rendered DOM without shipping
						or rerunning the repository client.
					</p>
					<p>
						A component may own client tasks and server continuations without turning those task
						bodies into mixed setup. The compiler emits both roots, marks the SSR component range
						for eager resumption, and preserves invoked return values in streamed responses.
					</p>
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

import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import {
	compilerTourAuthoredSource,
	compilerTourGeneratedSetupSource,
	compilerTourGeneratedViewSource
} from '../examples/compiler-tour.js';
import { Article, Callout } from './Article.jsx';

/** Explains how ordinary eXact source becomes precise runtime machinery. */
export function CompilerTourPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="What the compiler writes for you"
			description="Follow one component from ordinary state, tasks, bindings, conditions, and keyed lists to the runtime machinery the compiler creates."
			previous={{ path: '/learn/state', label: 'State & derived values' }}
			next={{ path: '/learn/lists', label: 'Keyed lists' }}
		>
			<section>
				<h2>The component remains application-shaped</h2>
				<p>
					This example deliberately combines several features that are easy to read in source but
					require careful ownership at runtime: derived state, a cancelable deferred search, typed
					two-way bindings, reactive text and attributes, a conditional range, keyed identity, and
					an event that writes state.
				</p>
				<CodeBlock source={compilerTourAuthoredSource} language="tsx" title="CatalogEditor.tsx" />
			</section>
			<section>
				<h2>Setup becomes owned reactive work</h2>
				<p>
					This is a compiler-faithful lowering, formatted and annotated for people rather than
					copied byte-for-byte from a build artifact. Unchanged type declarations are omitted,
					intermediate values are named where that clarifies sequencing, and opaque stable IDs are
					replaced with descriptive placeholders. The helper calls and ownership structure are the
					machinery the compiler creates.
				</p>
				<CodeBlock
					source={compilerTourGeneratedSetupSource}
					language="ts"
					title="Generated setup, annotated"
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
						The query reactive value drives a deferred generation. Task context owns cancellation,
						the compiler passes its signal into the recognized optional API argument, and writes
						made by stale or aborted asynchronous work cannot publish.
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
				</div>
			</section>
			<Callout title="Generated code is an implementation contract, not an authoring API">
				<p>
					The helper names are private compiler/runtime coordination. Applications should use the
					authored form and rely on compiler diagnostics. The useful promise is semantic: precise
					dependencies, deterministic ownership, cancellation, stable identity, and minimal updates.
				</p>
			</Callout>
		</Article>
	);
}

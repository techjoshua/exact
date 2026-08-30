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
				<p>
					Conditional regions and <code>this.map()</code> remain focused compiler-owned operations.
					Keyed rows preserve their DOM and reactive ownership across reorders and release both when
					the key is removed; they are not converted into a virtual fragment tree.
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
				<p>
					The same browser artifact also owns initial attachment. A client-only root mounts through
					it, while matching server HTML passes it a hydration cursor for generated claims. If a
					claim fails, the owning root is replaced through that artifact&apos;s mount path; the
					runtime does not infer component ownership from whether the authored value happens to be a
					function.
				</p>
				<p>
					An application may have several independent mount or hydration roots. The build adapter
					derives each root&apos;s reachable artifacts from the bundler graph; no component is
					marked as the one global application root, and compiler build inventories are not shipped
					as runtime data. Within each entry, the compiler sends authored TSX mounts directly to the
					matching component, static render-program, or intrinsic root operation, including when the
					JSX is first stored in a local constant.
				</p>
			</section>
			<section>
				<h2>What to notice</h2>
				<p>
					A component does not need a <code>.tsx</code> filename when it does not author JSX. The
					compiler recognizes native components in ordinary TypeScript modules too. Installed eXact
					libraries can provide precompiled browser and server artifacts, so applications consume
					the correct target without executing the compiler at runtime. A library&apos;s generated
					build facts connect its public export to the target-specific artifact that owns the
					component, so barrel exports do not discard compiled dependency information. Local setup
					helpers can return the render closure too; the compiler carries their required component
					capabilities into the generated artifact without adding a generic render layer. When one
					native component composes another, it calls that child&apos;s browser artifact directly
					and publishes one atomic indexed-prop receipt; the child alone decides which of its
					interior bindings or ranges become dirty.
				</p>
				<p>
					Client-island activation follows that same compiled path. Hydration resolves the
					island&apos;s browser artifact and passes its opaque component operation directly to mount
					or markerless adoption; it does not wrap the component in a virtual node or rediscover how
					to run it.
				</p>
				<p>
					On the server, each native component follows the same target-local sequence. Its artifact
					issues request-owned work, writes the resulting HTML in authored order, and disposes that
					ownership after the complete subtree. Imported package components enter through their own
					server artifacts, so an application build does not need their source tree and server
					rendering does not construct browser-style component instances.
				</p>
				<p>
					Finite component registries select among those same compiled artifacts. Registry keys keep
					selection identity, lazy keys keep generation-fenced readiness, and rendering does not
					reclassify the selected native component or choose a new execution lane.
				</p>
				<p>
					Published component libraries use the same rule, including libraries nested beneath
					another installed package. They ship conditional browser and server executables plus inert
					build facts; the application validates those facts without compiling or inspecting
					dependency source. A React-owned component enters through one precompiled compatibility
					island rather than a runtime-created adapter. If native children pass through that React
					owner, React receives only an opaque keyed carrier: it can retain or clone the carrier,
					but cannot inspect whether the owned native range contains text, elements, components, a
					collection, or nothing.
				</p>
				<p>
					Direct precompiled pipelines also use <code>rootDir</code> as an output-containment
					boundary. Inputs outside it are rejected before any path beneath <code>outDir</code> is
					derived or written. Client, server, shared, map, and inspection outputs are staged as one
					publication; a failed commit restores the previous generation. Transform results report
					the framework packages imported by the emitted target so a published library build can
					verify that its package manifest declares every runtime dependency.
				</p>
				<p>
					Editor compiler sessions bound native response time and settle cancellation immediately.
					If a native phase wedges, the next request starts a clean process and replays the last
					complete project synchronization.
				</p>
				<p>
					Client programs carry compact component-local claim and binding data instead of one
					generated binder function per TSX region. The artifact graph can also generate the client
					bootstrap for the server operations and lazy islands reachable from the entry.
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
							component slots let it adopt native children without redundant wrapper markup. A
							generated client range keeps the component&apos;s original state-slot identities, so
							server publication and browser updates address the same fields directly.
						</p>
					</div>
				</div>
			</section>
		</Article>
	);
}

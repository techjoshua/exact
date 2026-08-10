import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const buildConfig = `export default defineExactConfig({
  debug: {
    catalog: 'auto',
    runtime: 'auto'
  }
});`;

const authorization = `const server = createExactServerRuntime({
  contract,
  inspectionCatalogs: [inspectionCatalog],
  allowDebug: async ({ platformRequest, capability }) => {
    const operator = await authenticateIncidentOperator(platformRequest);
    return operator.debug &&
      (capability !== 'source' || operator.sourceDebug);
  }
});`;

/** Documents the optional full-stack runtime inspection boundary. */
export function DevtoolsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Inspect the running component model"
			description="eXact DevTools joins durable browser instances, compiler explanations, server continuations, and microfrontend roots through one bounded read-only protocol."
			previous={{ path: '/learn/language-tools', label: 'Compiler-aware language tools' }}
			next={{ path: '/guides/routing', label: 'Routing' }}
		>
			<section>
				<h2>DevTools inspects the model you authored</h2>
				<p>
					An eXact application already has durable component owners, precise state dependencies,
					task generations, client/server placement, Suspense readiness, and structured cleanup.
					DevTools exposes that existing model; it does not reconstruct a component tree by guessing
					from DOM shape or wrap the application in a second state system.
				</p>
				<p>
					Inspection combines two deliberately separate sources. A compiler catalog explains static
					facts such as source ranges, dependencies, effects, and placement reasons. Optional
					runtime instrumentation contributes live instances, bounded state previews, task status,
					and timeline events. The protocol joining them is read-only and requires explicit
					production authorization.
				</p>
				<p>
					Client-only pages open a local inspection session and do not probe a conventional server
					URL. Server cooperation begins only when the runtime receives an explicit endpoint or
					discovers one in compiler-owned hydration metadata.
				</p>
				<p>
					Vite instrumented modules establish a runtime import barrier before application
					evaluation, so the first native client root is inspection-owned rather than racing a
					sibling bootstrap script. Compiler-generated reactive root cells preserve that ownership
					when the renderer enters the authored component tree.
				</p>
			</section>
			<section>
				<h2>Build output and runtime access are separate</h2>
				<CodeBlock source={buildConfig} language="ts" title="exact.config.ts" />
				<p>
					The catalog is server-owned rich metadata. Runtime instrumentation carries only compact
					correlation identities. Development can enable both automatically; hardened builds set
					both controls to <code>false</code>. A production deployment must enable output
					deliberately and still authorize each session. The Vite, Webpack, and Bun integrations
					keep catalog assets in their server output and outside public client graphs.
				</p>
				<p>
					Ordinary endpoint traffic does not construct the debug runtime or decode catalogs.
					Session, catalog, event-buffer, and observation ownership is allocated lazily only after a
					valid debug message.
				</p>
				<CodeBlock source={authorization} language="ts" title="server.ts" />
			</section>
			<section>
				<h2>One durable tree, across runtimes</h2>
				<p>
					Select an element to find its logical component owner, source component, build, and
					execution root. State and public contexts appear as bounded previews. Tasks keep their
					placement, readiness, priority, generation, cancellation, concurrency, and optimistic
					status. Activity, Suspense, hydration, requests, continuations, patches, and errors share
					the same timeline vocabulary. Compiler-marked task IDs travel with each function
					definition, so the inspector never guesses identity from array order.
				</p>
			</section>
			<section>
				<h2>Microfrontends authorize independently</h2>
				<p>
					The page host routes remote queries through its existing eXact binding gateway. It
					validates the registered binding, build, and root, then opens a child session at the
					component host. Both hosts run their own <code>allowDebug</code> decision. Browser
					credentials are never copied to the component host.
				</p>
				<p>
					Page and remote timelines retain independent cursors, so reconnecting one producer does
					not duplicate or reorder another producer's records.
				</p>
			</section>
			<section>
				<h2>Humans and agents use the same protocol</h2>
				<p>
					The Chromium extension's Components tree shows every durable instance in its live
					parent/child hierarchy. Selecting an instance opens its state, props, context, task, and
					dependency details. The tree and details panes scroll independently, and live updates
					preserve their positions and expanded sections. Selecting another component keeps the tree
					position while opening its details from the top.
				</p>
				<p>
					The Profiler records an explicit interaction window, groups events into causal framework,
					interaction, or request frames. Here, unlike the instance tree, it aggregates reactive
					changes and task work into waterfall lanes per authored component type so repeated costs
					are visible. Stopping the recording finalizes it from retained history after the starting
					cursor, so delayed subscription delivery cannot leave a silent gap. The Microfrontends
					view summarizes independently deployed roots. The CDP agent sends the same validated
					requests through fixed functions. Neither surface can evaluate caller JavaScript, mutate
					state, invoke tasks, or receive raw component instances.
				</p>
				<p>
					For local use, build the Chromium package and load its package directory as an unpacked
					extension. Its manifest points to generated assets and the Manifest V3 content entries are
					emitted as classic scripts. The panel and worker entries are self-contained bundles, so
					extension pages do not resolve packages through the application. If the panel opens before
					the inspected page bridge, its requests wait in a bounded per-tab queue and flush when the
					bridge connects. Closed panels release queued work, and a missing response fails after
					five seconds instead of leaving the panel stuck on Connecting. Reloading the extension
					also fences its old content port before the page bridge disconnects, and panel
					registration points at the generated document from the extension root.
				</p>
				<p>
					Source navigation opens only exact SHA-256 matches, checking source-mapped resources, then
					workspace files, then an independently authorized server excerpt.
				</p>
			</section>
			<Callout title="Redact before traversal">
				<p>
					Compiler-qualified secrets and server resources become selectors, never values. Preview
					construction applies those selectors before inspecting an object and never invokes
					getters, serialization hooks, callbacks, or a failed Proxy again.
				</p>
			</Callout>
		</Article>
	);
}

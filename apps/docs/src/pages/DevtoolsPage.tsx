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
			next={{ path: '/learn/lists', label: 'Keyed lists' }}
		>
			<section>
				<h2>Build output and runtime access are separate</h2>
				<CodeBlock source={buildConfig} language="ts" title="exact.config.ts" />
				<p>
					The catalog is server-owned rich metadata. Runtime instrumentation carries only compact
					correlation identities. Development can enable both automatically; hardened builds set
					both controls to <code>false</code>. A production deployment must enable output
					deliberately and still authorize each session.
				</p>
				<CodeBlock source={authorization} language="ts" title="server.ts" />
			</section>
			<section>
				<h2>One durable tree, across runtimes</h2>
				<p>
					Select an element to find its logical component owner, source component, build, and
					execution root. State and public contexts appear as bounded previews. Tasks and actions
					keep their placement, readiness, priority, generation, cancellation, concurrency, and
					optimistic status. Activity, Suspense, hydration, requests, continuations, patches, and
					errors share the same timeline vocabulary.
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
					The Chromium extension offers Components, State/Context, Tasks/Actions, Dependencies,
					Timeline, and Microfrontends views. The CDP agent sends the same validated requests
					through fixed functions. Neither surface can evaluate caller JavaScript, mutate state,
					invoke actions, or receive raw component instances.
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

import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const providerSource = `const Panel = createDynamicComponent<PanelProps>((signal) =>
  extensionProvider.resolve(this.state.panelName, { signal })
);

return () => (
  <Suspense fallback={<LoadingPanel />}>
    <Panel account={this.state.account} />
  </Suspense>
);`;

const annotationSource = `/** @exact dynamic */
const Panel = installedPanels[this.state.panelName];

return () => <Panel account={this.state.account} />;`;

/** Documents intentionally open, client-only component selection. */
export function DynamicComponentsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Open dynamic components"
			description="Resolve a component whose candidate set is intentionally unknown while preserving client ownership, cancellation, diagnostics, and a strict server boundary."
			previous={{ path: '/learn/component-registries', label: 'Component registries' }}
			next={{ path: '/learn/async-interfaces', label: 'Suspense, Activity & scheduling' }}
		>
			<section>
				<h2>Use the open boundary only when the set is truly open</h2>
				<p>
					A finite component registry remains the preferred choice when every candidate can be
					listed. It participates in SSR, placement analysis, identity, and exact chunk planning.
					An open dynamic component is for an installed extension or provider whose eventual
					compiler-branded component is not statically knowable.
				</p>
			</section>
			<section>
				<h2>A typed provider owns asynchronous selection</h2>
				<CodeBlock source={providerSource} language="tsx" title="Workspace.tsx" />
				<p>
					The resolver is established during setup. Reactive reads become selection dependencies;
					a change aborts the current generation and stale results cannot mount. Pending resolution
					uses the nearest Suspense boundary, while <code>null</code> or <code>undefined</code> means
					the component is absent.
				</p>
			</section>
			<section>
				<h2>Acknowledge an intentionally opaque binding</h2>
				<CodeBlock source={annotationSource} language="tsx" title="InstalledPanel.tsx" />
				<p>
					Without the narrow <code>@exact dynamic</code> annotation, the compiler still emits the
					client boundary but reports <code>EXACT2213</code>. The annotation does not make an invalid
					value executable or adapt a React-owned component; language tooling continues to report
					those errors at their actual boundary.
				</p>
			</section>
			<section>
				<h2>SSR stays inert; hydration starts resolution</h2>
				<p>
					The server emits the owned range and a static fallback without reading the candidate,
					importing its module, running setup, or issuing tasks. Hydration adopts that range and
					starts client resolution. When an authorized immutable artifact is known independently,
					SSR may emit a bounded module-preload hint without activating it.
				</p>
			</section>
			<Callout title="No server authority" tone="warning">
				<p>
					A resolved open component cannot declare continuations, server tasks, actions, refresh
					operations, or executors. Use a trusted microfrontend or a statically authorized component
					boundary when independently deployed code needs eXact server execution.
				</p>
			</Callout>
		</Article>
	);
}

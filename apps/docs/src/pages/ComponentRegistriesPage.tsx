import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const branchSource = `const CurrentPanel = this.state.mode === 'edit' ? Editor : Preview;

return () => <CurrentPanel document={this.state.document} />;`;

const registrySource = `const Widget = createComponentRegistry(({ lazy }) => ({
  summary: SummaryWidget,
  chart: lazy(() =>
    import('./ChartWidget.js').then((module) => module.ChartWidget)
  )
}));

type WidgetKey = KeyOf<typeof Widget>;

function Dashboard(this: Component<{ selected: WidgetKey }>) {
  const CurrentWidget = Widget[this.state.selected];
  return () => <CurrentWidget />;
}`;

const narrowingSource = `if (!hasComponent(Widget, requested)) {
  return <NotFound />;
}

const CurrentWidget = Widget[requested];
return <CurrentWidget />;`;

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

/** Documents finite eager and lazy component selection across rendering targets. */
export function ComponentRegistriesPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Choose components dynamically"
			description="Start with an ordinary finite choice, use a registry for reusable or lazy selection, and keep the open client-only boundary as a deliberate fallback."
			previous={{ path: '/learn/lists', label: 'Keyed lists' }}
			next={{ path: '/learn/async-interfaces', label: 'Suspense, Activity & scheduling' }}
		>
			<section>
				<h2>Use an ordinary branch for a local choice</h2>
				<p>
					When a component chooses between a few known views in one place, keep the choice in
					ordinary TypeScript. The compiler can see every candidate and replace only the selected
					range.
				</p>
				<CodeBlock source={branchSource} language="tsx" title="DocumentPanel.tsx" />
			</section>
			<section>
				<h2>Dynamic selection needs a finite ownership boundary</h2>
				<p>
					When JSX names a component directly, the compiler knows which definition owns the
					resulting instance. Choosing a component from data makes that relationship dynamic. eXact
					still needs to know the complete set of possible definitions so it can preserve instance
					identity, lifecycle, placement, bundle boundaries, SSR markers, and hydration behavior.
				</p>
				<p>
					A component registry is that finite contract: an immutable mapping from authored keys to
					eager or lazy component definitions. It is not a mutable service locator or an
					application-owned table of loader callbacks. The key is both the selection value and the
					identity of the component range it owns.
				</p>
			</section>
			<section>
				<h2>Declare the whole choice once</h2>
				<p>
					<code>createComponentRegistry()</code> accepts a finite object in a named module-level
					<code>const</code>. Entries may be eager components or scoped lazy imports. The registry
					is immutable so the compiler can prove every key, import, placement, and output target.
				</p>
				<CodeBlock source={registrySource} language="tsx" title="widgets.tsx" />
			</section>
			<section>
				<h2>Keys remain ordinary TypeScript</h2>
				<p>
					<code>KeyOf&lt;typeof Widget&gt;</code> derives the exact key union. Use
					<code>hasComponent()</code> to narrow an untrusted string before indexing instead of
					casting or maintaining a second allowlist.
				</p>
				<CodeBlock source={narrowingSource} language="tsx" title="selection.tsx" />
			</section>
			<section>
				<h2>A key owns component identity</h2>
				<p>
					Every key exposes a stable facade. Rendering the same key retains its component instance;
					selecting another key replaces only that component range, even when two entries share one
					implementation. State, tasks, refs, resources, and cleanup therefore follow the authored
					selection.
				</p>
			</section>
			<section>
				<h2>Lazy work is fenced and inspectable</h2>
				<p>
					Concurrent reads deduplicate one lazy load. Failed loads may retry, and a stale candidate
					cannot commit after the selected key changes. <code>preloadComponent()</code> starts a
					known entry early, while <code>inspectComponentRegistry()</code> reports mode, status, and
					generation without exposing loaders.
				</p>
			</section>
			<section>
				<h2>SSR and hydration agree on the selection</h2>
				<p>
					The compiler gives the registry and entries opaque identities. SSR retains registry
					binding, key, and identity in the component marker. Hydration adopts a match; a nested
					mismatch remounts only that range and preserves compatible siblings.
				</p>
			</section>
			<section>
				<h2>Prefer a finite contract when one is possible</h2>
				<p>
					Branches and registries let eXact analyze component identity, placement, chunks, SSR, and
					hydration before the application runs. They also narrow untrusted names without casts and
					make the available surface easy to inspect. React-owned values still use the explicit
					compatibility adapter when ownership is not compiler-branded.
				</p>
			</section>
			<section>
				<h2>Fall back to an open boundary only when the set is truly open</h2>
				<p>
					An installed extension or external provider may return a compiler-branded component whose
					candidate set cannot be listed at build time. <code>createDynamicComponent()</code> gives
					that resolution a typed, cancelable client-owned boundary. Reactive selection changes
					abort stale candidates, and pending resolution uses the nearest Suspense boundary.
				</p>
				<CodeBlock source={providerSource} language="tsx" title="Workspace.tsx" />
				<p>
					A narrow <code>@exact dynamic</code> annotation acknowledges an intentionally opaque
					binding. Without it, the compiler still emits the client boundary but warns that the
					candidate set is unknown. The annotation does not make an invalid value executable or
					adapt a React-owned component.
				</p>
				<CodeBlock source={annotationSource} language="tsx" title="InstalledPanel.tsx" />
			</section>
			<Callout title="Open dynamics have no server authority" tone="warning">
				<p>
					SSR emits an inert owned range and static fallback; hydration begins resolution in the
					browser. A resolved open component cannot declare continuations, server tasks, actions,
					refresh operations, or executors. Use a trusted microfrontend or statically authorized
					component boundary when independently delivered code needs eXact server execution.
				</p>
			</Callout>
		</Article>
	);
}

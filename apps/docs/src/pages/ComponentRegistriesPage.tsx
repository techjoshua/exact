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
			description="Choose which component to display, preserve its state, and load less-used views on demand."
			previous={{ path: '/learn/async-interfaces', label: 'Suspense, Activity & scheduling' }}
			next={{ path: '/learn/server-execution', label: 'Server execution' }}
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
				<h2>Tell the compiler which views are possible</h2>
				<p>
					A dashboard may choose a widget from saved user preferences. If you maintain a component
					lookup, a list of valid names, and lazy loaders separately, they can drift apart. An eXact
					component registry declares those choices together. It gives you typed keys and optional
					lazy loading while eXact manages each selected component’s state and lifetime.
				</p>
				<p>
					<code>createComponentRegistry()</code> is useful when several places share a set of
					possible views or when some views should load on demand. A registry must be declared once
					at module scope so eXact can prepare its entries for the appropriate build targets.
				</p>
			</section>
			<section>
				<h2>Declare the whole choice once</h2>
				<p>
					<code>createComponentRegistry()</code> accepts a finite object in a named module-level
					<code>const</code>. Entries may be eager components or scoped lazy imports. The registry
					is immutable so the compiler can prove every key, import, placement, and output target.
				</p>
				<p>
					The declaration is eXact source syntax and must pass through the compiler. Its client and
					server builds receive different executable registry artifacts.
				</p>
				<CodeBlock source={registrySource} language="tsx" title="widgets.tsx" />
				<p>
					A lazy loader returns a static import and selects one export. The selection can read a
					module property or use <code>{'({ ChartWidget }) => ChartWidget'}</code> to select it by
					destructuring. An immutable local named loader works too. The compiler must identify the
					module and export without executing the loader.
				</p>
			</section>
			<section>
				<h2>Keys remain ordinary TypeScript</h2>
				<p>
					<code>KeyOf&lt;typeof Widget&gt;</code> derives the exact key union. Use
					<code>hasComponent()</code> to narrow an untrusted string before indexing instead of
					casting or maintaining a second allowlist.
				</p>
				<p>
					Export the derived key type when navigation or other metadata needs the same finite
					selection. A type-only import keeps those modules independent of the component imports.
				</p>
				<CodeBlock source={narrowingSource} language="tsx" title="selection.tsx" />
			</section>
			<section>
				<h2>Keep state when the selection stays the same</h2>
				<p>
					Every key exposes a stable facade. Rendering the same key retains its component instance.
					Selecting another key replaces only that component range, even when two entries share one
					implementation. State, tasks, refs, resources, and cleanup therefore follow the authored
					selection.
				</p>
			</section>
			<section>
				<h2>Load a view when it is needed</h2>
				<p>
					Write lazy imports using source module paths. The compiler and build adapter resolve them
					to the matching client or server output. You do not need generated artifact paths.
				</p>
				<p>
					Concurrent reads deduplicate one lazy load. Failed loads may retry, and a stale candidate
					cannot commit after the selected key changes. <code>preloadComponent()</code> starts a
					known entry early, while <code>inspectComponentRegistry()</code> reports mode, status, and
					generation without exposing loaders.
				</p>
			</section>
			<section>
				<h2>Render the selected view on the server</h2>
				<p>
					The compiler gives the registry and entries opaque identities. SSR retains registry
					binding, key, and identity in the component marker. Hydration adopts a match. A nested
					mismatch remounts only that range and preserves compatible siblings. The selected
					component retains its server-rendered state and server task connections during hydration.
				</p>
				<p>
					For a lazy selection, hydration waits for its module before connecting the existing DOM.
					It keeps input edits made while loading and leaves unselected entries unloaded. When you
					need to wait for that work, the hydration root exposes <code>whenSettled()</code>.
				</p>
			</section>
			<section>
				<h2>Choose between a branch and a registry</h2>
				<p>
					Branches and registries let eXact analyze component identity, placement, chunks, SSR, and
					hydration before the application runs. They also narrow untrusted names without casts and
					make the available surface easy to inspect. React-owned values still use the explicit
					compatibility adapter when ownership is not compiler-branded.
				</p>
			</section>
			<section>
				<h2>Accept components discovered at runtime</h2>
				<p>
					An installed extension or external provider may return a compiler-branded component whose
					candidate set cannot be listed at build time. <code>createDynamicComponent()</code> gives
					that resolution a typed, cancelable client-owned boundary. Reactive selection changes
					abort stale candidates, and pending resolution uses the nearest Suspense boundary. Dynamic
					components do not require a finite registry. Registries additionally preserve static
					placement, SSR, and hydration guarantees for their known candidates.
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
					SSR emits an inert owned range and static fallback. Hydration begins resolution in the
					browser. A resolved open component cannot declare continuations, server tasks, actions,
					refresh operations, or executors. Use a trusted microfrontend or statically authorized
					component boundary when independently delivered code needs eXact server execution.
				</p>
			</Callout>
		</Article>
	);
}

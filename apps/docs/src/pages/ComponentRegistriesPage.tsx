import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

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

/** Documents finite eager and lazy component selection across rendering targets. */
export function ComponentRegistriesPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Finite component registries"
			description="Select eager or lazy components dynamically while keeping keys, identity, placement, bundles, SSR, and hydration visible to the compiler."
			previous={{ path: '/learn/lists', label: 'Keyed lists' }}
			next={{ path: '/learn/async-interfaces', label: 'Suspense, Activity & scheduling' }}
		>
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
				<h2>The boundary is intentionally finite</h2>
				<p>
					React-owned values still use the explicit compatibility adapter when ownership is not
					compiler-branded. Open-ended remote registries and additional production graph enforcement
					remain separate trust and deployment work.
				</p>
			</section>
		</Article>
	);
}

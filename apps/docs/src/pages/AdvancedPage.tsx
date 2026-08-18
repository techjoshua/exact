import type { Component } from '@exactjs/core';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

type AdvancedCard = { /** @exact key */ title: string; text: string; packages: string };
const advancedCards: AdvancedCard[] = [
	{
		title: 'SSR and hydration',
		text: 'Render boundary-marked HTML, adopt existing DOM, and lazily activate safe interaction islands.',
		packages: '@exactjs/ssr · @exactjs/hydrate'
	},
	{
		title: 'Server components',
		text: 'Compile cooperating client/server state machines with allowlisted task invocations and refresh boundaries.',
		packages: '@exactjs/compiler · @exactjs/server'
	},
	{
		title: 'Streaming',
		text: 'Reveal settled Suspense ranges while respecting cancellation, limits, and backpressure.',
		packages: '@exactjs/ssr'
	},
	{
		title: 'React compatibility',
		text: 'Run supported React packages through compatibility runtimes and ecosystem adapters.',
		packages: '@exactjs/react-compat'
	},
	{
		title: 'Build adapters',
		text: 'Use the shared compiler transformation pipeline through Vite, Webpack, Bun, or the exactc precompile workflow.',
		packages: '@exactjs/vite-plugin · @exactjs/webpack-plugin · @exactjs/bun-plugin'
	},
	{
		title: 'Microfrontends',
		text: 'Expose trusted component roots and recover independently deployed boundaries.',
		packages: '@exactjs/microfrontends'
	}
];

/** Explains SSR, hydration, server components, and adapter-level deployment boundaries. */
export function AdvancedPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore"
			title="Beyond the browser"
			description="The same component model extends through SSR, progressive readiness, selective hydration, server execution, React compatibility, and trusted microfrontends."
			previous={{ path: '/examples/logo-lab', label: 'Logo lab' }}
			next={{ path: '/packages', label: 'Package map' }}
		>
			<Callout title="Implemented does not mean unlimited" tone="warning">
				<p>
					These paths have implementation and integration coverage. Production adopters must still
					configure authorization, CSRF, CSP, limits, deployment pinning, observability, and request
					contexts. Complicated server-child splitting, additional structural patch forms, and
					microfrontend hosts beyond Vite/Rollup remain explicit limits.
				</p>
			</Callout>
			<section>
				<h2>The wider system</h2>
				<div className="card-grid advanced-grid">
					{advancedCards.map((card) => (
						<div theme:surface="raised" className="topic-card">
							<strong>{card.title}</strong>
							<p>{card.text}</p>
							<code>{card.packages}</code>
						</div>
					))}
				</div>
			</section>
			<section>
				<h2>Start at the center</h2>
				<p>
					Build a client component first. Add routing and forms. Test it. Reach for hydration or
					server placement when the application has a concrete reason to cross that boundary.
				</p>
			</section>
			<section>
				<h2>SSR uses the host&apos;s cheapest body path</h2>
				<p>
					A settled SSR response carries a single-consumer ordered chunk body. The Node adapter
					writes those chunks directly with native backpressure, avoiding a final join, extra UTF-8
					buffer, and Web stream. Fetch-style adapters create the equivalent
					<code>ReadableStream</code> only when their host requests it. Because rendering has
					already settled, request-scoped resources can be released before the transport finishes
					sending those bytes.
				</p>
				<p>
					Checked output counts UTF-8 bytes incrementally, and attribute serialization walks owned
					properties directly. String APIs still behave normally; their one final join happens only
					when application code reads the complete HTML value.
				</p>
			</section>
			<section>
				<h2>Interactive HTML does not have to hydrate eagerly</h2>
				<p>
					Browser builds can declare <code>renderMode: 'hydrate'</code> when they adopt SSR HTML or{' '}
					<code>renderMode: 'client'</code> when they only mount fresh DOM. The bundler keeps the
					executable component contract for that mode and leaves analysis-only inventories in the
					compiler result. Use the default universal mode when one artifact must support both.
				</p>
				<p>
					SSR resumption records apply only when a component&apos;s compiler identity matches its
					server marker and that existing range is adopted. Mismatched pages introduced before
					hydration, later client routes, and conditional views initialize as fresh browser
					instances.
				</p>
				<p>
					Compiler-cell roots adopt their existing marker range without clearing the application
					container. Native component calls reuse their component identity marker instead of adding
					a redundant cell pair, while intrinsic and structural reactive ranges keep independent
					ownership markers. Resumption records preserve order between repeated instances of one
					component without depending on SSR preparation order between unrelated component types.
				</p>
				<p>
					Compiler-owned hydration metadata omits schema-defined empty arrays and objects, then
					restores shared immutable defaults in the browser. Authored empty state, props, and
					context values remain application data. When a generated client registration owns
					continuation contracts, the server can omit a duplicate document copy.
				</p>
				<p>
					Eligible intrinsic regions write their compiler-owned hydration markers directly during
					SSR instead of constructing a temporary fallback tree. Finite synchronous branches inside
					an async page also avoid per-node promise work, while unsupported structures retain the
					same local fallback and ownership behavior.
				</p>
				<p>
					A hydrate-only client artifact also omits the duplicate generic VNode factory for a
					compiler-closed intrinsic program. Complete and server-capable artifacts retain that
					fallback, and a malformed document still enters deterministic root hydration recovery.
				</p>
				<p>
					Document config, island props, JSON responses, and streamed events pass through the same
					bounded reactive-protocol decoder. Static repair also uses the DOM renderer&apos;s
					intrinsic namespace, attribute, URL, class, and unsafe-HTML contract, so eager and
					deferred adoption do not maintain competing interpretations of server HTML.
				</p>
				<p>
					The root bootstrap is parsed once before client ownership is created. Static scalar DOM
					properties apply directly; only compiler expressions and supported composite reactive
					values allocate retained property observers.
				</p>
				<p>
					The hydration-only client accepts only its compiler-declared root configuration fields.
					Transport, continuation, and island fields remain exclusive to the complete runtime and
					cause the narrow document configuration to fail closed rather than being ignored.
				</p>
				<p>
					The compiler recognizes client islands whose initial browser responsibility is limited to
					bounded click, submit, input, change, or focus handling and reactive form bindings. SSR
					emits the real inert control, and the generated hydration registration loads that
					island&apos;s chunk when its first interaction reaches the document. Finite immutable prop
					spreads retain source overwrite order, while refs, initial client work, unsupported events
					or event data, and opaque spreads remain eager with a source-located explanation.
					Independently planned server child ranges stay inert and refreshable inside a dormant
					island instead of forcing its client code eager.
				</p>
				<p>
					Activation records are queued in order while code loads without retaining native event
					objects. Repeated input/change events coalesce to the latest value per target, submit
					records are never displaced by lower-value records, and generated identity prevents replay
					into a stale replacement. A dirty input keeps its live browser value during adoption and
					flows through the same compiled binding used after hydration.
				</p>
				<p>
					Passive hydration leaves document-body focus alone. If an authored control already owns
					focus, adoption and later reactive patches preserve that connected control and its input
					or editable selection when DOM work temporarily drops focus.
				</p>
				<Callout title="Framework-owned, not cooperative">
					<p>
						Components do not need hydration lifecycle hooks. The compiler, intrinsic binding, SSR
						boundary, and hydration runtime already have the information needed to preserve the DOM
						and deliver the interaction once.
					</p>
				</Callout>
			</section>
		</Article>
	);
}

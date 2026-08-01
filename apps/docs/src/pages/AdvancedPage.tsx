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
		text: 'Use the compiler through Vite, Webpack, Bun, or the exactc precompile workflow.',
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
			previous={{ path: '/compare', label: 'Framework comparison' }}
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
						<div className="topic-card">
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
				<h2>Interactive HTML does not have to hydrate eagerly</h2>
				<p>
					SSR resumption records apply only when a component&apos;s compiler identity matches its
					server marker and that existing range is adopted. Mismatched pages introduced before
					hydration, later client routes, and conditional views initialize as fresh browser
					instances.
				</p>
				<p>
					The compiler recognizes client islands whose initial browser responsibility is limited to
					supported events and reactive form bindings. SSR emits the real inert control, and the
					generated hydration registration loads that island&apos;s chunk when its first interaction
					reaches the document. Islands with refs, initial client work, unsupported events, opaque
					prop spreads, or server-only child graphs remain eager automatically.
				</p>
				<p>
					Actions are queued in order while code loads, repeated input/change events coalesce to the
					latest value per target, and generated identity prevents replay into a stale replacement.
					A dirty input keeps its live browser value during adoption and flows through the same
					compiled binding used after hydration.
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

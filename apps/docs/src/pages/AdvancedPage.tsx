import type { Component } from '@exactjs/core';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

type AdvancedCard = { /** @exact key */ title: string; text: string; packages: string };
const advancedCards: AdvancedCard[] = [
	{
		title: 'SSR and hydration',
		text: 'Render HTML on the server, adopt it in the browser, and defer eligible interactions.',
		packages: '@exactjs/ssr · @exactjs/hydrate'
	},
	{
		title: 'Server execution',
		text: 'Use server resources from component tasks while keeping private code out of the browser.',
		packages: '@exactjs/compiler · @exactjs/server'
	},
	{
		title: 'Streaming',
		text: 'Reveal ready Suspense content while the rest of the page continues loading.',
		packages: '@exactjs/ssr'
	},
	{
		title: 'React compatibility',
		text: 'Use supported React packages inside an eXact application.',
		packages: '@exactjs/react-compat'
	},
	{
		title: 'Build integrations',
		text: 'Compile eXact applications with Vite, Webpack, Bun, or exactc.',
		packages: '@exactjs/vite-plugin · @exactjs/webpack-plugin · @exactjs/bun-plugin'
	},
	{
		title: 'Microfrontends',
		text: 'Expose trusted component roots from independently deployed applications.',
		packages: '@exactjs/microfrontends'
	}
];

/** Introduces eXact features that span browser and server runtimes. */
export function AdvancedPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore"
			title="Beyond the browser"
			description="Add server rendering, server tasks, streaming, React packages, and microfrontends when your application needs them."
			previous={{ path: '/examples/logo-lab', label: 'Logo lab' }}
			next={{ path: '/packages', label: 'Package map' }}
		>
			<section>
				<h2>Choose the features you need</h2>
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
				<h2>Start with a client component</h2>
				<p>
					Build the component, add routing and forms, then test its behavior. Add server rendering
					or server tasks when they improve startup, data access, or security.
				</p>
			</section>

			<section>
				<h2>Server rendering and hydration</h2>
				<p>
					Server rendering produces HTML and public component state. Hydration adopts the existing
					DOM, preserves form state and focus, and continues the same component in the browser. The
					root must belong to that window&apos;s current document; embedded documents hydrate from
					their own runtime rather than transferring DOM ownership to a parent window. A failed DOM
					update can be retried with the same VNode; the renderer does not publish failed patch state
					as a completed render.
				</p>
				<p>
					Use <code>renderMode: 'hydrate'</code> for browser builds that adopt server HTML,
					<code>renderMode: 'client'</code> for client-only builds, or the default mode when one
					build must support both.
				</p>
				<p>
					Eligible controls can load their client code on first interaction. The compiler explains
					why a component must hydrate eagerly when it cannot be deferred safely.
				</p>
			</section>

			<Callout title="Prepare production controls" tone="warning">
				<p>
					Configure authorization, CSRF protection, CSP, request limits, deployment pinning,
					observability, and request context before production deployment. Check the relevant guide
					for current host and integration limits. Profiling callbacks are observational: eXact
					contains their exceptions so they cannot change the application operation being measured.
				</p>
			</Callout>
		</Article>
	);
}

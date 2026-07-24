import type { Component } from '@exactjs/core';
import { Article, Callout } from './Article.jsx';

type AdvancedCard = { /** @exact key */ title: string; text: string; packages: string };
const advancedCards: AdvancedCard[] = [
	{
		title: 'SSR and hydration',
		text: 'Render boundary-marked HTML, then adopt it without discarding useful server work.',
		packages: '@exactjs/ssr · @exactjs/hydrate'
	},
	{
		title: 'Server components',
		text: 'Compile client and server artifacts with manifest-allowlisted actions and refresh boundaries.',
		packages: '@exactjs/compiler · @exactjs/server'
	},
	{
		title: 'Streaming',
		text: 'Produce document events or browser-ready progressive HTML while respecting cancellation and backpressure.',
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
		packages: '@exactjs/vite-plugin · @exactjs/webpack-plugin'
	},
	{
		title: 'Microfrontends',
		text: 'Describe exposures, resolve remote components, and recover boundaries through an explicit plugin.',
		packages: '@exactjs/microfrontends'
	}
];

export function AdvancedPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore"
			title="Beyond the browser"
			description="The browser component model is the approachable center. Around it, eXact is developing a compiler-led path through servers, streams, hydration, and other ecosystems."
			previous={{ path: '/compare', label: 'Framework comparison' }}
			next={{ path: '/packages', label: 'Package map' }}
		>
			<Callout title="Read this as capability, not a production promise" tone="warning">
				<p>
					The foundation is implemented and tested, but the distributed component protocol is still
					expanding. Consult the repository’s focused architecture documents before adopting these
					paths.
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
		</Article>
	);
}

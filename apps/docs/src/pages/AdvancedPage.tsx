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

/** Explains SSR, hydration, server components, and adapter-level deployment boundaries. */
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
			<section>
				<h2>Interactive HTML does not have to hydrate eagerly</h2>
				<p>
					The compiler recognizes client islands whose initial browser responsibility is limited to
					supported events and reactive form bindings. SSR emits the real inert control, and the
					hydration runtime adopts that range when its first interaction reaches the document.
					Islands with refs, initial client work, unsupported events, or server-only child graphs
					remain eager automatically.
				</p>
				<p>
					A dirty input keeps its live browser value during adoption. That value flows through the
					same compiled binding used after hydration, while generated element identity prevents a
					captured interaction from being delivered to a stale replacement.
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

import type { Component } from '@exactjs/core';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

/** Explains the repository's reproducible cross-framework application comparison. */
export function FrameworkComparisonPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Reproducible evidence"
			title="Compare complete applications, not toy loops"
			description="The framework comparison suite gives eXact and other frameworks the same incident-operations experience while preserving each framework's idiomatic architecture."
			next={{ path: '/runtimes', label: 'Review runtime support' }}
		>
			<section>
				<h2>One experience, two questions</h2>
				<p>
					The application combines server rendering, deep links, optimistic claims, conflict
					recovery, validated comments, background analysis, and live updates. Browser-visible
					behavior is contractual; component boundaries, state ownership, routing, caching, and
					server invocation remain native to each framework.
				</p>
				<div className="card-grid">
					<div className="topic-card">
						<span className="topic-index">Controlled service</span>
						<strong>Hold the server contract steady</strong>
						<p>
							Each participant calls the same Fetch-compatible JSON and event service so browser
							delivery, startup, rendering, and interaction behavior can be compared directly.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Native full stack</span>
						<strong>Let every framework own its architecture</strong>
						<p>
							Participants may use their preferred server actions, loaders, RPC, streaming, and
							cache model while preserving the same domain invariants and user outcomes.
						</p>
					</div>
				</div>
			</section>

			<section>
				<h2>Measure tradeoffs without inventing a winner</h2>
				<p>
					A scenario must pass correctness assertions before timing is accepted. Results keep raw
					samples, exact versions, environment metadata, and known limitations. Browser, server,
					build, delivery, memory, and codebase complexity remain separate dimensions rather than
					being collapsed into one score.
				</p>
			</section>

			<Callout title="Current status">
				<p>
					The controlled track has production SSR implementations for eXact, React, SvelteKit, and
					Nuxt. A separate native track exercises eXact compiler server tasks and React Router
					loaders and actions. Both acceptance suites and the controlled measurement harness are
					implemented. Specialist reviews remain pending, so no results or rankings are published.
				</p>
			</Callout>
		</Article>
	);
}

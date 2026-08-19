import type { Component } from '@exactjs/core';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

/** Explains the repository's reproducible cross-framework application comparison. */
export function FrameworkComparisonPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Reproducible evidence"
			title="Compare complete applications"
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
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Controlled service</span>
						<strong>Hold the server contract steady</strong>
						<p>
							Each participant calls the same Fetch-compatible JSON and event service so browser
							delivery, startup, rendering, and interaction behavior can be compared directly.
						</p>
					</div>
					<div theme:surface="raised" className="topic-card">
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
				<p>
					Controlled browser samples are labeled warm after one equivalent discarded scenario per
					participant. Interaction timings run from the captured browser event to the visible DOM
					mutation, excluding automation waits while retaining any interaction-triggered hydration.
				</p>
				<p>
					Paint samples require cross-origin isolation and keep the standard first-contentful-paint
					start time as the canonical FCP metric. Chromium&apos;s optional render-completion and
					frame presentation timestamps are recorded separately when the browser exposes them,
					without substituting one definition for another.
				</p>
				<p>
					Heap samples follow semantic readiness, one rendering opportunity, and explicit garbage
					collection. Results label this as post-GC retained heap rather than treating live
					allocation noise as evidence of a leak.
				</p>
				<p>
					A separate cold-start CPU profile disables the browser cache and records JavaScript parse,
					compile, evaluation, and total script duration through semantic readiness. Unthrottled,
					4x, and 6x CPU profiles distinguish desktop startup from CPU-constrained behavior without
					conflating either with network transfer time.
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

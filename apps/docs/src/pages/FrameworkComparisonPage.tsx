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
					Paint samples use the standard first-contentful-paint start time. Measured documents
					navigate directly to each participant server so harness interception does not become part
					of browser navigation timing.
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
					conflating either with network transfer time. Diagnostic eXact builds can also attribute
					shipped and executed bytes to source modules; parsed and compiled function totals remain
					bundle-level when Chromium does not publish source locations.
				</p>
			</section>

			<Callout title="Current status">
				<p>
					The controlled track has production SSR implementations for eXact, React, SvelteKit, Nuxt,
					and TanStack Start. A separate native track exercises eXact compiler server tasks and
					React Router loaders and actions. Both acceptance suites and the controlled measurement
					harness are implemented. The latest admitted evidence is published on the Performance
					results page with current raw framework values, arithmetic means, and percentiles; it
					deliberately does not collapse the dimensions into one ranking. Historical comparisons
					remain in the internal engineering evidence.
				</p>
			</Callout>

			<section>
				<h2>Server attribution</h2>
				<p>
					The SSR report keeps end-to-end results separate from diagnostic evidence. Its preloaded
					render lane removes controlled-service loading, while a separate instrumented lane divides
					that loading into fetch and JSON-decode time. Response accounting separates semantic
					markup, framework markers, hydration data, comparison data, and the document envelope.
					These lanes explain a result; they do not replace the production-route comparison.
				</p>
				<p>
					Comparable browser, startup, and SSR timing samples run in balanced interleaved rounds:
					each framework takes every order position over a complete cycle, and alternating cycles
					reverse direction. Raw reports retain those orders. Process-owned startup, retention, and
					instrumented profiling remain isolated so their memory and CPU attribution stays
					meaningful.
				</p>
			</section>
		</Article>
	);
}

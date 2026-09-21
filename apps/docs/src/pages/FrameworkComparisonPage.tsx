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
					Participants share one stylesheet while implementing their components in each framework.
					Desktop and mobile checks compare visible content, computed styles, and screenshots before
					JavaScript and after interactions. Equivalent appearance is part of correctness.
				</p>
				<p>
					A scenario must pass correctness assertions before timing is accepted. Results keep raw
					samples, exact versions, environment metadata, and known limitations. Browser, server,
					build, delivery, memory, and codebase complexity remain separate dimensions rather than
					being collapsed into one score.
				</p>
				<p>
					Client samples reuse each framework's captured production HTML and assets over HTTP.
					Framework servers stop before measurement. Each sample uses a fresh cache-disabled context
					in a warm browser process, after one discarded scenario per participant. Interaction
					timings run from the captured browser event to the visible DOM mutation, excluding
					automation waits while retaining any interaction-triggered hydration.
				</p>
				<p>
					Paint samples use the standard first-contentful-paint start time. Measured documents load
					from the same static HTTP implementation, without browser interception. Actions and live
					updates still use the shared HTTP service. These client timings exclude SSR generation;
					live-server and SSR measurements remain separate.
				</p>
				<p>
					Heap samples follow semantic readiness, one rendering opportunity, and explicit garbage
					collection. Results label this as post-GC retained heap rather than treating live
					allocation noise as evidence of a leak.
				</p>
				<p>
					A separate heap-composition diagnostic collects snapshots after an incident claim settles,
					without running CPU or allocation profilers. Balanced rounds produce additive mean
					self-byte categories for V8 code and metadata, internal nodes, objects, strings, and
					native nodes. These snapshot totals differ from the retained JavaScript heap metric and do
					not measure total browser process memory.
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
					The performance charts cover the controlled track. Both native full-stack participants
					also pass their acceptance tests, including updates from another session while preserving
					a focused draft. Native measurements remain a separate comparison because their server
					transports and application architectures differ from the controlled track.
				</p>
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
					Node and Bun results use separate production targets. All five Bun participants use native
					Bun serving: eXact's Bun adapter, React's selected rendering API, SvelteKit's Bun adapter,
					and Nitro's Bun preset for Nuxt and TanStack Start. Each target passes the shared SSR,
					hydration, and interaction checks before measurement.
				</p>
				<p>
					String and streaming APIs are measured separately, using the same mode on Node and Bun.
					Each application renders its own complete document and hydration data. eXact, React, and
					TanStack Start expose both APIs. The current Nuxt and SvelteKit fixtures use buffered
					document rendering and have no streaming-API result. Streaming results measure complete
					responses, including hydration data; they do not establish early resource discovery.
					Browser measurements use the string lane.
				</p>
				<p>
					The performance page uses sustained capacity captures with independent load-driver
					processes and counterbalanced fresh server populations. Preloaded rendering/response
					throughput, normal data-loading requests, and independently scheduled arrivals are labeled
					separately. Each scheduled rate gets fresh worker, service, and driver processes, with 30
					seconds of target-rate warmup and 60 seconds of measurement. The second population
					reverses framework and rate order. Aggregate RPS divides valid responses by elapsed time,
					including drain. Driver CPU, scheduling lag, missed arrivals, and errors help distinguish
					generator limits from server saturation. The earlier short-window throughput charts are
					superseded. Response-time, payload, and memory charts retain their separately dated
					captures.
				</p>
				<p>
					Local comparisons keep the application, controlled service, and load drivers on one host.
					Linux measurement commands verify native loopback routing and record the observed route
					and network namespace. Virtualized localhost forwarding can change relative throughput, so
					a consistent network path is part of the comparison conditions.
				</p>
				<p>
					The SSR report keeps end-to-end results separate from diagnostic evidence. Its preloaded
					render lane removes controlled-service loading, while a separate instrumented lane divides
					that loading into fetch and JSON-decode time. Response accounting separates semantic
					markup, framework markers, hydration data, comparison data, and the document envelope.
					Preloaded capacity is published separately from normal-loading capacity and native
					full-stack results.
				</p>
				<p>
					Focused runtime experiments also compare unchanged and optimized builds in interleaved
					rounds. Reduced response allocation or faster rendering may have a smaller effect on
					complete requests that load data. Published framework charts retain their capture dates
					and are refreshed from complete comparison runs.
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

import type { Component } from '@exactjs/core';
import { Article, Callout } from './Article.jsx';

export function ComparisonPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore"
			title="How eXact compares"
			description="React, Vue, Svelte, and eXact can all build serious interfaces. The useful comparison is where each framework puts state, update work, lifecycle, and ecosystem boundaries—and which tradeoffs fit your application."
			previous={{ path: '/examples/logo-lab', label: 'Logo lab' }}
			next={{ path: '/advanced', label: 'Beyond the browser' }}
		>
			<section>
				<h2>The short comparison</h2>
				<div className="table-scroll">
					<table>
						<thead>
							<tr>
								<th>Concern</th>
								<th>eXact</th>
								<th>React</th>
								<th>Vue</th>
								<th>Svelte</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>Component model</td>
								<td>Long-lived instance; setup returns a connected view.</td>
								<td>Function components are called to produce the next UI description.</td>
								<td>
									Component instance with Options or Composition API setup and a reactive render
									effect.
								</td>
								<td>Compiled component source using Svelte syntax and runes.</td>
							</tr>
							<tr>
								<td>State</td>
								<td>Direct fields on a deeply reactive instance object.</td>
								<td>Hooks or external stores; setters schedule rendering.</td>
								<td>Reactive proxies and refs, with computed values and watchers.</td>
								<td>
									<code>$state</code>, <code>$derived</code>, and related runes in current syntax.
								</td>
							</tr>
							<tr>
								<td>Update model</td>
								<td>Compiler-preserved expression boundaries update directly.</td>
								<td>Render, compare, then commit necessary host changes.</td>
								<td>Tracked reactivity schedules optimized virtual-DOM component updates.</td>
								<td>Compiler-generated reactive updates with push-pull derived propagation.</td>
							</tr>
							<tr>
								<td>Async ownership</td>
								<td>Tasks combine dependencies, cancellation, placement, and resource disposal.</td>
								<td>
									Effects and framework/library conventions; cleanup is returned from effects.
								</td>
								<td>
									Watchers, effects, lifecycle hooks, and surrounding application framework
									conventions.
								</td>
								<td>Effects, lifecycle, async template features, and SvelteKit conventions.</td>
							</tr>
							<tr>
								<td>Ecosystem today</td>
								<td>Small and repository-first; includes targeted React compatibility.</td>
								<td>Very large package, renderer, and framework ecosystem.</td>
								<td>Large ecosystem with an official application framework.</td>
								<td>Mature compiler framework with SvelteKit and a growing package ecosystem.</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>
			<section>
				<h2>Where eXact is making a distinct bet</h2>
				<p>
					eXact combines four decisions that are often separate: long-lived component instances,
					compiler inference over ordinary TSX, fine-grained reactive DOM expressions, and
					compiler-visible ownership of async and distributed work. The goal is not merely fewer DOM
					operations; it is one analyzable model from a state read through tasks, server placement,
					manifests, hydration, and plugins.
				</p>
				<div className="card-grid">
					<div className="topic-card">
						<span className="topic-index">Compared with React</span>
						<strong>Setup is not render</strong>
						<p>
							The component body initializes an instance once. Updates do not require calling that
							body to produce another tree.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Compared with Vue</span>
						<strong>More inference from TSX</strong>
						<p>
							Reactive objects are familiar, while the compiler also lifts safe local derivations
							and expression boundaries.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Compared with Svelte</span>
						<strong>TSX plus an instance protocol</strong>
						<p>
							Both make strong compiler bets; eXact keeps TSX and exposes task, context, logging,
							and plugin ownership on the instance.
						</p>
					</div>
				</div>
			</section>
			<section>
				<h2>Reasons not to choose eXact yet</h2>
				<p>
					Choose an established alternative when public-package stability, a broad hiring pool,
					third-party UI libraries, production case studies, or a large support community outweigh
					eXact's model. eXact's current setup is repository-first, and some distributed protocols
					are still expanding.
				</p>
			</section>
			<section>
				<h2>Reasons to evaluate it</h2>
				<p>
					eXact is worth a close look when you want direct mutable-looking state without component
					rerender semantics; when async cancellation and cleanup are central rather than
					incidental; when compiler, server, hydration, and plugin boundaries should share one
					manifest model; or when React compatibility can make a gradual trial realistic.
				</p>
			</section>
			<Callout title="Comparison basis">
				<p>
					This page compares documented programming models, not synthetic benchmark scores.
					Performance, bundle size, and team productivity depend on the application and should be
					measured with a real vertical slice.
				</p>
				<p>
					Primary references:{' '}
					<a href="https://react.dev/learn/render-and-commit" target="_blank" rel="noreferrer">
						React render and commit
					</a>
					,{' '}
					<a
						href="https://vuejs.org/guide/extras/reactivity-in-depth.html"
						target="_blank"
						rel="noreferrer"
					>
						Vue reactivity
					</a>
					, and{' '}
					<a href="https://svelte.dev/docs/svelte/overview" target="_blank" rel="noreferrer">
						Svelte overview
					</a>
					.
				</p>
			</Callout>
		</Article>
	);
}

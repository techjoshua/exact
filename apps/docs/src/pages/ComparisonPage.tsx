import type { Component } from '@exactjs/core';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

/** Compares framework execution and reactivity models without reducing them to a scorecard. */
export function ComparisonPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore"
			title="How eXact compares"
			description="React, Vue, Svelte, and eXact can all build serious interfaces. The useful comparison is where each framework puts state, update work, lifecycle, async readiness, and server coordination."
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
								<td>Component instance with setup and a reactive render effect.</td>
								<td>Compiled component source using Svelte syntax and runes.</td>
							</tr>
							<tr>
								<td>State</td>
								<td>Direct fields on a deeply reactive, inspectable instance object.</td>
								<td>Hooks or external stores; setters schedule rendering.</td>
								<td>Reactive proxies and refs, with computed values and watchers.</td>
								<td>
									<code>$state</code>, <code>$derived</code>, and related runes.
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
								<td>Async interface</td>
								<td>
									Compiler-lowered awaits, owned tasks, Suspense readiness, retained Activity
									ranges, and task priority.
								</td>
								<td>Suspense, transitions, Actions, Activity, and concurrent rendering.</td>
								<td>Async setup, Suspense, watchers, and framework conventions.</td>
								<td>Async template boundaries, effects, and SvelteKit data conventions.</td>
							</tr>
							<tr>
								<td>Server coordination</td>
								<td>
									Compiler-distributed client/server state machines and validated state/context
									exchange.
								</td>
								<td>SSR primitives plus framework-defined server-component architecture.</td>
								<td>SSR primitives plus framework-defined server routes and hydration.</td>
								<td>Compiled SSR and SvelteKit server/client boundaries.</td>
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
					executable component contracts, hydration, and plugins.
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
				<h2>The functional boundary today</h2>
				<p>
					eXact covers precise client updates, keyed identity, portals, typed bindings, owned async
					work, Suspense, retained inactive trees, scheduling, SSR, progressive boundary reveals,
					DOM adoption, lazy interaction hydration, server execution, and fine-grained server
					patches. It also has coordinated function-defined tasks, optimistic state, enhanced forms,
					and compiler-checked finite eager/lazy component registries. Those are current
					capabilities rather than roadmap labels.
				</p>
				<p>
					React remains more permissive when a component type comes from an opaque runtime registry.
					eXact deliberately requires a finite registry contract so placement, lazy imports, SSR,
					hydration, and component identity remain provable. React also exposes View Transitions,
					resource hints, file-upload and no-JavaScript action paths, and partial-prerender resume
					primitives that eXact does not yet match with native contracts.
				</p>
				<p>
					eXact&apos;s progressive renderer does not serialize postponed renderer state for a later
					resume request. Some complicated server-child graphs still fall back to broader splitting
					or boundary replacement. These are specific remaining gaps, not a missing component model.
				</p>
			</section>
			<section>
				<h2>Reasons to evaluate it</h2>
				<p>
					eXact is worth a close look when you want direct mutable-looking state without component
					rerender semantics; when async cancellation and cleanup are central rather than
					incidental; when compiler, server, hydration, and plugin boundaries should share one
					checked component model; or when React compatibility can make a gradual trial realistic.
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

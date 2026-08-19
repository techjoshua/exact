import type { Component } from '@exactjs/core';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

/** Presents complete repository applications and the framework behavior each one exercises. */
export function SamplesPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Complete applications"
			title="Beyond the counter"
			description="Each sample is a complete application built around a different part of eXact's compiler-led model. Six browser applications are published with these docs; the remaining examples can be built locally."
			next={{ path: '/getting-started', label: 'Create an eXact app' }}
		>
			<section aria-labelledby="hosted-applications">
				<h2 id="hosted-applications">Open a hosted application</h2>
				<p>
					These browser applications are deployed alongside the documentation. Each one links back
					to the framework guide most relevant to what it demonstrates.
				</p>
				<div className="card-grid application-directory">
					<a theme:surface="raised" className="topic-card" href="./sudoku.html">
						<strong>Sudoku Atelier</strong>
						<p>
							Persistent state, clock-derived elapsed time, precise board updates, gestures, motion,
							and responsive play.
						</p>
					</a>
					<a theme:surface="raised" className="topic-card" href="./kanban/">
						<strong>eXact Kanban</strong>
						<p>Keyed identity, direct mutation, forms, and drag-and-drop list updates.</p>
					</a>
					<a theme:surface="raised" className="topic-card" href="./workbench/">
						<strong>Project Workbench</strong>
						<p>Tasks, derived values, forms, and several component-owned workspace tools.</p>
					</a>
					<a theme:surface="raised" className="topic-card" href="./enhancements/">
						<strong>Enhancement Playground</strong>
						<p>Theme Lab, motion, gestures, physics, and gravity on ordinary elements.</p>
					</a>
					<a theme:surface="raised" className="topic-card" href="./intl/">
						<strong>Intl Testbed</strong>
						<p>Translation structure, plural rules, formatting, and right-to-left layout.</p>
					</a>
				</div>
			</section>

			<section theme:surface="raised" className="sudoku-showcase">
				<div>
					<p className="demo-kicker">Hosted demo</p>
					<h2>Sudoku Atelier</h2>
					<p>
						A polished, installable Sudoku game that combines direct component state, persistence,
						responsive controls, theming, and precise board updates. Typing a digit edits the
						selected cell directly. Its stable cells retain value and pencil-mark layers while
						board-root CSS drives number highlighting; mouse users can right-click notes, and solved
						games preserve their final time. Optional gesture and motion enhancements add long-press
						input and attributed transitions without changing that core structure.
					</p>
					<p>
						Sudoku Atelier is published with this documentation site. Use it to see how an eXact
						application feels before exploring the source in the repository.
					</p>
				</div>
				<a theme:action="primary" className="primary-link" href="./sudoku.html">
					Play Sudoku Atelier <span aria-hidden="true">{'→'}</span>
				</a>
			</section>

			<section>
				<h2>Production-shaped client and server work</h2>
				<div className="card-grid">
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Shipping Calculator</span>
						<strong>Follow one feature across the network</strong>
						<p>
							This application demonstrates native server rendering, hydration, client islands, and
							server continuations through a production-shaped server. It is the best sample for
							understanding how compiler-selected data and work move between runtimes. Its
							server-rendered application shell also publishes the semantic theme consumed by its
							calculator UI.
						</p>
					</div>
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Kanban</span>
						<strong>Preserve identity through busy list updates</strong>
						<p>
							The board exercises keyed collections, direct mutation, forms, and focused updates in
							an interface where cards and columns must retain their identity as they move.
							Generated theme tokens drive the palette without owning its board layout or drag
							behavior.
						</p>
						<a theme:action="secondary" href="./kanban/">
							Open Kanban
						</a>
					</div>
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Project Workbench</span>
						<strong>Compose a larger stateful workspace</strong>
						<p>
							Workbench brings several component-owned tools together to demonstrate forms, derived
							values, tasks, fine-grained updates, and package-scoped semantic theme roles across a
							denser application shell.
						</p>
						<a theme:action="secondary" href="./workbench/">
							Open Project Workbench
						</a>
					</div>
				</div>
			</section>

			<section>
				<h2>Visual systems without hidden ownership</h2>
				<div className="card-grid">
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Enhancement Playground</span>
						<strong>Compose theme, motion, gestures, and physics</strong>
						<p>
							Theme actions and selections share ordinary intrinsic elements with independent motion
							and gesture enhancements. The sample demonstrates composition without a shared
							component runtime or hidden state system.
						</p>
						<a theme:action="secondary" href="./enhancements/">
							Open the playground and Theme Lab
						</a>
					</div>
				</div>
			</section>

			<section>
				<h2>Distributed ownership and placement</h2>
				<div className="card-grid">
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Microfrontend Portal</span>
						<strong>Compose independently delivered features</strong>
						<p>
							The portal exercises trusted microfrontend composition, runtime ownership, shared
							capabilities, and the boundaries that keep independently built application regions
							safe.
						</p>
					</div>
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Server Components</span>
						<strong>Inspect compiler-planned server artifacts</strong>
						<p>
							This sample focuses on component placement, generated client and server roots, trusted
							server resources, and the public data allowed to cross the boundary.
						</p>
					</div>
				</div>
			</section>

			<section>
				<h2>Internationalization across real locale structures</h2>
				<div className="card-grid">
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Intl Testbed</span>
						<strong>Compare four cultural interpretations side by side</strong>
						<p>
							The testbed renders shared reactive values through English, French, Japanese, and
							Arabic catalogs, including structural reordering, plural and ordinal projection,
							semantic units, dates, durations, and lazy catalog adoption.
						</p>
						<a theme:action="secondary" href="./intl/">
							Open the Intl Testbed
						</a>
					</div>
				</div>
			</section>

			<Callout title="Repository examples">
				<p>
					Shipping Calculator, Microfrontend Portal, and Server Components remain source examples in
					the eXact repository. Kanban, Project Workbench, Enhancement Playground with Theme Lab,
					Intl Testbed and Sudoku Atelier are published alongside this documentation site.
				</p>
			</Callout>
		</Article>
	);
}

import type { Component } from '@exactjs/core';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

/** Presents complete repository applications and the framework behavior each one exercises. */
export function SamplesPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Complete applications"
			title="Beyond the counter"
			description="Each sample is a complete application built around a different part of eXact's compiler-led model. Four browser applications are published with these docs; the remaining examples can be built locally."
			next={{ path: '/getting-started', label: 'Create an eXact app' }}
		>
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
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Puzzle Foundry</span>
						<strong>Separate application theme from document design</strong>
						<p>
							The authoring shell uses semantic theme sources and roles, while printable puzzle
							artwork and user-selected publication colors remain explicit document data.
						</p>
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

			<Callout title="Repository examples">
				<p>
					Shipping Calculator, Microfrontend Portal, and Server Components remain source examples in
					the eXact repository. Kanban, Project Workbench, Enhancement Playground with Theme Lab,
					Puzzle Foundry, and Sudoku Atelier are published alongside this documentation site.
				</p>
			</Callout>
		</Article>
	);
}

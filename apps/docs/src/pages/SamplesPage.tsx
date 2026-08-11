import type { Component } from '@exactjs/core';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

/** Presents complete repository applications and the framework behavior each one exercises. */
export function SamplesPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Complete applications"
			title="Beyond the counter"
			description="Each sample is a complete application built around a different part of eXact's compiler-led model. Sudoku Atelier is the hosted demo; the others are repository examples you can build locally."
			next={{ path: '/getting-started', label: 'Create an eXact app' }}
		>
			<section className="sudoku-showcase">
				<div>
					<p className="demo-kicker">Hosted demo</p>
					<h2>Sudoku Atelier</h2>
					<p>
						A polished, installable Sudoku game that combines direct component state, persistence,
						responsive controls, theming, and precise board updates. Optional gesture and motion
						enhancements add long-press input and attributed transitions without changing the core
						component structure.
					</p>
					<p>
						Sudoku Atelier is the only sample published with this documentation site. Use it to see
						how an eXact application feels before exploring the source in the repository.
					</p>
				</div>
				<a className="primary-link" href="./sudoku.html">
					Play Sudoku Atelier <span aria-hidden="true">{'→'}</span>
				</a>
			</section>

			<section>
				<h2>Production-shaped client and server work</h2>
				<div className="card-grid">
					<div className="topic-card">
						<span className="topic-index">Shipping Calculator</span>
						<strong>Follow one feature across the network</strong>
						<p>
							This application demonstrates native server rendering, hydration, client islands, and
							server continuations through a production-shaped server. It is the best sample for
							understanding how compiler-selected data and work move between runtimes.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Kanban</span>
						<strong>Preserve identity through busy list updates</strong>
						<p>
							The board exercises keyed collections, direct mutation, forms, and focused updates in
							an interface where cards and columns must retain their identity as they move.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Project Workbench</span>
						<strong>Compose a larger stateful workspace</strong>
						<p>
							Workbench brings several component-owned tools together to demonstrate forms, derived
							values, tasks, and fine-grained updates across a denser application shell.
						</p>
					</div>
				</div>
			</section>

			<section>
				<h2>Distributed ownership and placement</h2>
				<div className="card-grid">
					<div className="topic-card">
						<span className="topic-index">Microfrontend Portal</span>
						<strong>Compose independently delivered features</strong>
						<p>
							The portal exercises trusted microfrontend composition, runtime ownership, shared
							capabilities, and the boundaries that keep independently built application regions
							safe.
						</p>
					</div>
					<div className="topic-card">
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
					Shipping Calculator, Kanban, Project Workbench, Microfrontend Portal, and Server
					Components are source examples in the eXact repository. They are not deployed as routes on
					this documentation site.
				</p>
			</Callout>
		</Article>
	);
}

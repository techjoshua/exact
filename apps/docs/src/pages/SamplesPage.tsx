import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const standaloneCommand = `npm run build:puzzle-generator:standalone
# Output: apps/puzzle-generator/dist/puzzle-foundry.html`;

/** Presents complete repository applications and the framework behavior each one exercises. */
export function SamplesPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Complete applications"
			title="Explore eXact beyond a counter."
			description="The repository samples are product-shaped applications built with native setup-once components, direct state, and compiler-owned updates."
			next={{ path: '/getting-started', label: 'Create an eXact app' }}
		>
			<section>
				<h2>Puzzle Foundry</h2>
				<p>
					Puzzle Foundry creates Sudoku, word-search, and crossword artwork entirely in the browser.
					A visible seed makes each result reproducible. Common print settings feed two independent
					SVG documents: the unsolved puzzle and its answer key.
				</p>
				<div className="card-grid">
					<div className="topic-card">
						<span className="topic-index">Sudoku</span>
						<strong>4×4 and 9×9</strong>
						<p>Difficulty changes clue density while every exported grid retains one solution.</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Search</span>
						<strong>Rectangular and safety checked</strong>
						<p>Hard mode adds near matches; generated lines are screened for blocked sequences.</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Crossword</span>
						<strong>Connected and compact</strong>
						<p>Repeated layouts maximize overlap and disclose words that cannot join the grid.</p>
					</div>
				</div>
				<CodeBlock source={standaloneCommand} language="shell" />
				<Callout title="One genuinely portable file">
					The standalone artifact includes the application, styles, compiler output, and client
					runtime. It loads from disk without external scripts, styles, fonts, images, or services.
				</Callout>
			</section>

			<section>
				<h2>Other native samples</h2>
				<ul>
					<li>
						<strong>Sudoku Atelier</strong> — an installable game with direct state, persistence,
						responsive controls, and optional gesture and motion enhancements.
					</li>
					<li>
						<strong>Shipping Calculator</strong> — production-shaped SSR, hydration, client islands,
						and server continuations.
					</li>
					<li>
						<strong>Kanban and Project Workbench</strong> — stateful application interfaces with
						fine-grained list and form updates.
					</li>
					<li>
						<strong>Microfrontend Portal and Server Components</strong> — distributed ownership,
						placement, trust, and generated server artifacts.
					</li>
				</ul>
			</section>
		</Article>
	);
}

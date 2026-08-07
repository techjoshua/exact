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
					fixed-page SVG documents: the unsolved puzzle and its answer key. Titles have independent
					type controls, Letter/A4/Legal pages use configurable margins, and fit warnings explain
					when content must be reduced. Answer keys can use color or puzzle-specific black-and-white
					rendering.
				</p>
				<div className="card-grid">
					<div className="topic-card">
						<span className="topic-index">Sudoku</span>
						<strong>4×4 and 9×9</strong>
						<p>
							Difficulty changes clue density while every grid retains one solution. Answer digits
							may use a separate font and weight.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Search</span>
						<strong>Rectangular and safety checked</strong>
						<p>
							Hard mode adds near matches; monochrome solutions circle answers with transparent
							ovals.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Crossword</span>
						<strong>Connected and compact</strong>
						<p>
							Repeated layouts maximize overlap. Human-readable answer-and-clue lines become
							numbered Across and Down lists, with separate grid, unused-cell, and letter-cell
							colors.
						</p>
					</div>
				</div>
				<CodeBlock source={standaloneCommand} language="shell" />
				<p>
					For word searches and crosswords, an optional WebLLM helper can turn a topic into editable
					puzzle material. After the user opts in, the app loads a pinned WebLLM runtime from
					jsDelivr and downloads its Qwen2.5 0.5B model from Hugging Face. The browser caches the
					model and runs it locally through WebGPU. Generated JSON crosses the same normalization
					and safety boundary as manually entered words, and the cached model can be removed
					afterward.
				</p>
				<Callout title="One genuinely portable file">
					The standalone artifact includes the application, styles, compiler output, and client
					runtime. Non-AI features load from disk without external scripts, styles, fonts, images,
					or services. AI use requires HTTPS or localhost plus network access for the pinned WebLLM
					runtime and first model download; prompts never leave the device.
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

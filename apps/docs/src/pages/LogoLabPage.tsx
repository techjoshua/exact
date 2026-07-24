import type { Component } from '@exactjs/core';
import { LogoLab } from '../LogoLab.jsx';
import { Article } from './Article.jsx';

export function LogoLabPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore · client-only"
			title="Logo lab"
			description="Edit a small Logo program and give the turtle instructions. The parser is bounded, the animation belongs to the component, and the drawing remains data rather than an opaque bitmap."
			previous={{ path: '/plugins/secrets', label: 'Secrets' }}
			next={{ path: '/compare', label: 'Framework comparison' }}
		>
			<LogoLab />
			<section>
				<h2>Why this is an eXact-shaped example</h2>
				<div className="card-grid">
					<div className="topic-card">
						<span className="topic-index">State</span>
						<strong>The program is data</strong>
						<p>
							Source, instructions, position, heading, segments, and progress are reactive fields.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Life</span>
						<strong>The timer has an owner</strong>
						<p>Animation starts after mount and is aborted when its component leaves the page.</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">View</span>
						<strong>The inspector stays precise</strong>
						<p>Coordinates and progress update independently while keyed segments accumulate.</p>
					</div>
				</div>
			</section>
			<section>
				<h2>A deliberately small language</h2>
				<p>
					The interpreter accepts movement, turns, pen control, four semantic colors, and nested
					<code> REPEAT </code>blocks. It never uses <code>eval()</code>. Source length, nesting,
					repeats, numeric range, and expanded command count are bounded before execution.
				</p>
			</section>
		</Article>
	);
}

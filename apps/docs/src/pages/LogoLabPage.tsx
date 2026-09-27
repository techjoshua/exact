import type { Component } from '@exactjs/core';
import { LogoLab } from '../LogoLab.jsx';
import { Article } from './Article.jsx';

/** Hosts the interactive Logo interpreter within the documentation article shell. */
export function LogoLabPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore · client-only"
			title="Logo lab"
			description="Edit a Logo program and watch a turtle draw it. Try loops, procedures, and changes while it runs."
			previous={{ path: '/performance', label: 'Performance results' }}
			next={{ path: '/story', label: 'The story behind eXact' }}
		>
			<LogoLab />
			<section>
				<h2>How the example works</h2>
				<div className="card-grid">
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">State</span>
						<strong>The program is data</strong>
						<p>
							Source, instructions, position, heading, segments, and progress are reactive fields.
						</p>
					</div>
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">Life</span>
						<strong>The timer has an owner</strong>
						<p>Animation starts after mount and is aborted when its component leaves the page.</p>
					</div>
					<div theme:surface="raised" className="topic-card">
						<span className="topic-index">View</span>
						<strong>The inspector stays precise</strong>
						<p>Coordinates and progress update independently while keyed segments accumulate.</p>
					</div>
				</div>
			</section>
			<section>
				<h2>Supported Logo commands</h2>
				<p>
					The interpreter accepts movement, turns, pen control, four semantic colors, and nested
					<code> REPEAT </code>blocks. It never uses <code>eval()</code>. Source length, nesting,
					repeats, numeric range, and expanded command count are bounded before execution.
				</p>
			</section>
		</Article>
	);
}

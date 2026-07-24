import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';

export function NotFoundPage(this: Component<{}>) {
	return () => (
		<article className="article not-found">
			<p className="eyebrow">404 · a quiet wrong turn</p>
			<h1>That page is not in this map.</h1>
			<p className="lede">
				The documentation may have moved, or the turtle may have taken an ambitious turn.
			</p>
			<Link className="primary-link" to="/">
				Return to the introduction
			</Link>
		</article>
	);
}

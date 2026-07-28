import type { Child, Component } from '@exactjs/core';
import { Link } from '@exactjs/router';

type ArticleProps = {
	eyebrow: string;
	title: string;
	description: string;
	children?: Child | Child[];
	previous?: { path: string; label: string };
	next?: { path: string; label: string };
};

/** Provides the shared heading, navigation, and content layout for documentation articles. */
export function Article(this: Component<{}>, props: ArticleProps) {
	const children = Array.isArray(props.children)
		? props.children
		: props.children === undefined
			? []
			: [props.children];
	return () => (
		<article className="article">
			<header className="article-header">
				<p className="eyebrow">{props.eyebrow}</p>
				<h1>{props.title}</h1>
				<p className="lede">{props.description}</p>
			</header>
			{children}
			<nav className="page-navigation" aria-label="Page navigation">
				{props.previous ? (
					<Link className="page-nav-link" to={props.previous.path}>
						<small>Previous</small>
						<strong>{props.previous.label}</strong>
					</Link>
				) : (
					<span />
				)}
				{props.next ? (
					<Link className="page-nav-link page-nav-link--next" to={props.next.path}>
						<small>Next</small>
						<strong>{props.next.label}</strong>
					</Link>
				) : (
					<span />
				)}
			</nav>
		</article>
	);
}

import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { ThemeControl } from './Theme.jsx';

type DocsHeaderProps = {
	mobileOpen: boolean;
	onToggleNavigation(): void;
	onCloseNavigation(): void;
	onOpenSearch(): void;
};

/** Renders the documentation masthead and delegates shell navigation controls. */
export function DocsHeader(this: Component<{}>, props: DocsHeaderProps) {
	return () => (
		<header className="topbar">
			<button
				className="mobile-menu-button"
				type="button"
				aria-label="Open documentation navigation"
				aria-expanded={props.mobileOpen}
				onClick={props.onToggleNavigation}
			>
				<span aria-hidden="true">{'\u2630'}</span>
			</button>
			<Link className="brand" to="/" onClick={props.onCloseNavigation}>
				<span className="brand-mark" aria-hidden="true">
					eX
				</span>
				<span>eXact</span>
				<small>docs</small>
			</Link>
			<div className="topbar-actions">
				<a className="sudoku-link" href="./sudoku.html">
					<span>Play Sudoku</span> <span aria-hidden="true">{'\u2192'}</span>
				</a>
				<button className="search-trigger" type="button" onClick={props.onOpenSearch}>
					<span aria-hidden="true">{'\u2315'}</span> Search
				</button>
				<ThemeControl />
				<a className="github-link" href="https://github.com" target="_blank" rel="noreferrer">
					GitHub <span aria-hidden="true">{'\u2197'}</span>
				</a>
			</div>
		</header>
	);
}

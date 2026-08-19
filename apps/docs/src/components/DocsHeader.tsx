import type { Component } from '@exactjs/core';
import { ThemeModeToggle } from '@exactjs/app-theme-preference';
import { Link } from '@exactjs/router';
import { ThemeControl } from './ThemeControl.jsx';
import { ThemeContext } from './theme-context.js';

type DocsHeaderProps = {
	mobileOpen: boolean;
	onToggleNavigation(): void;
	onCloseNavigation(): void;
	onOpenSearch(): void;
};

/** Renders the documentation masthead and delegates shell navigation controls. */
export function DocsHeader(this: Component<{}>, props: DocsHeaderProps) {
	const theme = this.getContext(ThemeContext);
	return () => (
		<header theme:surface="raised" className="topbar">
			<button
				theme:action="quiet"
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
				<a theme:action="primary" className="sudoku-link" href="./sudoku.html">
					<span>Play Sudoku</span> <span aria-hidden="true">{'\u2192'}</span>
				</a>
				<button
					theme:action="secondary"
					className="search-trigger"
					type="button"
					onClick={props.onOpenSearch}
				>
					<span aria-hidden="true">{'\u2315'}</span> Search
				</button>
				<ThemeControl />
				<ThemeModeToggle
					appearance={theme.effectiveAppearance}
					onToggle={() => theme.toggleAppearance()}
				/>
				<a
					theme:action="quiet"
					className="github-link"
					href="https://github.com/techjoshua/exact"
					target="_blank"
					rel="noreferrer"
				>
					GitHub <span aria-hidden="true">{'\u2197'}</span>
				</a>
			</div>
		</header>
	);
}

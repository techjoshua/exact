import type { Component } from '@exactjs/core';
import { SudokuContext } from '../context.js';
import { themeName } from '../themes.js';
import type { ThemeId } from '../types.js';
import { SudokuBrand } from './SudokuBrand.jsx';
import { ThemePicker } from './ThemePicker.jsx';

type SudokuTopbarProps = {
	theme: ThemeId;
	lensOpen: boolean;
	themeMenuOpen: boolean;
	paused: boolean;
};

/** Renders the application-wide navigation and display controls. */
export function SudokuTopbar(this: Component<{}>, props: SudokuTopbarProps) {
	const game = this.getContext(SudokuContext);

	return () => (
		<header className="topbar">
			<SudokuBrand />
			<div className="topbar-actions">
				<a className="docs-link" href="./#/learn/state">
					State docs
				</a>
				<span className="theme-label">{themeName(props.theme)}</span>
				<button
					type="button"
					className="icon-button mobile-lens-trigger"
					aria-label={props.lensOpen ? 'Close eXact Lens' : 'Open eXact Lens'}
					aria-expanded={props.lensOpen}
					onClick={() => game.toggleLens()}
				>
					<span aria-hidden="true">⌁</span>
				</button>
				<ThemePicker current={props.theme} open={props.themeMenuOpen} />
				<button
					type="button"
					className="icon-button"
					aria-label={props.paused ? 'Resume game' : 'Pause game'}
					onClick={() => game.togglePause()}
				>
					<span aria-hidden="true">{props.paused ? '▶' : 'Ⅱ'}</span>
				</button>
			</div>
		</header>
	);
}

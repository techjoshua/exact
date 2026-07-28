import type { Component } from '@exactjs/core';
import { SudokuContext } from '../context.js';
import { themes } from '../themes.js';
import type { ThemeId } from '../types.js';

type ThemePickerProps = {
	current: ThemeId;
	open: boolean;
};

/** Renders the compact seven-theme selector. */
export function ThemePicker(this: Component<{}>, props: ThemePickerProps) {
	const game = this.getContext(SudokuContext);

	return () => (
		<div className="theme-picker">
			<button
				type="button"
				className="icon-button theme-trigger"
				aria-label="Choose a theme"
				aria-expanded={props.open}
				onClick={() => game.toggleThemeMenu()}
			>
				<span aria-hidden="true">◐</span>
			</button>
			{props.open ? (
				<div className="theme-menu" role="menu" aria-label="Choose a theme">
					<div className="theme-menu-heading">
						<strong>Choose your atmosphere</strong>
						<span>Same puzzle, entirely new mood.</span>
					</div>
					<div className="theme-options">
						{themes.map((theme) => (
							<button
								type="button"
								role="menuitemradio"
								aria-checked={props.current === theme.id}
								className="theme-option"
								className:is-active={props.current === theme.id}
								onClick={() => game.setTheme(theme.id)}
							>
								<span className={['theme-swatch', `swatch-${theme.id}`]} aria-hidden="true">
									{theme.swatch}
								</span>
								<span>
									<strong>{theme.name}</strong>
									<small>{theme.description}</small>
								</span>
								<span className="theme-check" aria-hidden="true">
									{props.current === theme.id ? '✓' : ''}
								</span>
							</button>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}
